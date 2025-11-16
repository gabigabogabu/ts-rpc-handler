import { RpcError } from "./common";
import { z } from "zod";
import chunk from 'lodash/chunk';

class MethodNotDefinedError extends RpcError {
  constructor(method: string) {
    super(`Method not defined: ${method}`, 'MethodNotDefinedError', 404);
    this.name = 'MethodNotDefinedError';
  }
}

class InvalidInputError extends RpcError {
  constructor(error: z.ZodError) {
    super(`Invalid input: ${error.message}`, 'InvalidInputError', 400, error);
    this.name = 'InvalidInputError';
    this.cause = error;
  }
}

class AuthenticationError extends RpcError {
  constructor(result: any) {
    super(`Authentication failed: ${result}`, 'AuthenticationError', 401, result);
    this.name = 'AuthenticationError';
    this.cause = result;
  }
}

class RateLimitError extends RpcError {
  constructor(result: any) {
    super(`Rate limit exceeded: ${result}`, 'RateLimitError', 429, result);
    this.name = 'RateLimitError';
    this.cause = result;
  }
}

type _RpcId = string | null | undefined;

// actual call
type Rpc<ParamsType> = {
  id?: _RpcId;
  method: string;
  params?: ParamsType;
}

type _RpcReturnBase = {id: _RpcId}
type _RpcReturnError = {error: unknown}
type _RpcReturnSuccess<R> = {result: R}
type RpcReturn<R> = _RpcReturnBase & (_RpcReturnError | _RpcReturnSuccess<R>);

type GuardResult<Meta> = {success: boolean; result: Meta}

type RpcDef<Params, AuthMeta, RateLimitMeta, Result> = {
  inputValidation: z.ZodSchema<Params>;
  auth: (rpc: Rpc<Params>) => Promise<GuardResult<AuthMeta>>;
  rateLimit: (rpc: Rpc<Params>, authResult: GuardResult<AuthMeta>) => Promise<GuardResult<RateLimitMeta>>;
  handle: (
    {
      params, 
      authResult, 
      rateLimitResult
    }: {
      params?: Params, 
      authResult: GuardResult<AuthMeta>, 
      rateLimitResult: GuardResult<RateLimitMeta>
    }) => Promise<Result>;
}

// type Prettify<T> = {
//   [K in keyof T]: T[K];
// } & {};

// optional auth and rateLimit that will be defaulted
type RpcDefInit<ParamsType, AuthMeta = unknown, RateLimitMeta = unknown, ResultType = unknown> =
  Pick<RpcDef<ParamsType, AuthMeta, RateLimitMeta, ResultType>, 'inputValidation' | 'handle'> &
  Partial<Pick<RpcDef<ParamsType, AuthMeta, RateLimitMeta, ResultType>, 'auth' | 'rateLimit'>>;

type ParamsOf<D> = D extends RpcDef<infer P, any, any, any> ? P : never;
type ResultOf<D> = D extends RpcDef<any, any, any, infer R> ? R : never;

type ExposedFunctions<RpcMap extends Record<string, RpcDef<any, any, any, any>>> = {
  [K in keyof RpcMap]: (args: ParamsOf<RpcMap[K]>) => ResultOf<RpcMap[K]>;
}

type RpcMapOf<H extends RpcHandler<any>> = H extends RpcHandler<infer T> ? T : never;

export type InferRpc<H extends RpcHandler<any>> = ExposedFunctions<RpcMapOf<H>>;

/**
 * Utility function to define an RPC
 * @param def 
 * @returns def
 */
export const defRpc = <ParamsType, AuthMeta = unknown, RateLimitMeta = unknown, ResultType = unknown>({
  inputValidation,
  handle,
  auth = async () => ({ success: true, result: undefined as unknown as AuthMeta }),
  rateLimit = async () => ({ success: true, result: undefined as unknown as RateLimitMeta }),
}: RpcDefInit<ParamsType, AuthMeta, RateLimitMeta, ResultType>): RpcDef<ParamsType, AuthMeta, RateLimitMeta, ResultType> => ({inputValidation, auth, rateLimit, handle});


export class RpcHandler<RpcMap extends Record<string, RpcDef<any, any, any, any>>> {
  private readonly bodySchema = z.array(z.object({
    id: z.string().optional(),
    method: z.string(),
    params: z.unknown().optional(),
  }));

  /**
   * RPC handler
   * @param rpcs - Record of RPC definitions
   * @param config - Configuration
   * @param config.parallelism - When handling a list of RPCs, the number of RPCs to handle in parallel
   */
  constructor(
    private readonly rpcs: RpcMap,
    private readonly config: {parallelism: number} = {parallelism: 1},
  ) {}

  async handle(request: unknown): Promise<RpcReturn<any>[]> {
    const validated = this.bodySchema.safeParse(request);
    if (!validated.success) throw new InvalidInputError(validated.error);
    return await this._handleValidated(validated.data);
  }

  /**
   * Handle rpc calls
   */
  private async _handleValidated(rpcs: Rpc<any>[]): Promise<RpcReturn<any>[]> {
    const rpcChunks = chunk(rpcs, this.config.parallelism);
    const results: RpcReturn<any>[] = [];
    for (const rpcChunk of rpcChunks) {
      const chunkResults = await Promise.all(rpcChunk.map(this._safeHandleSingleRpc.bind(this)));
      results.push(...chunkResults);
    }
    // only return results with an id
    return results.filter(r => Boolean(r.id));
  }

  private async _safeHandleSingleRpc(rpc: Rpc<any>): Promise<RpcReturn<any>> {
    try {
      const result = await this._handleSingleRpc(rpc);
      return {id: rpc.id, result};
    } catch (error) {
      if (error instanceof Error) {
        return {id: rpc.id, error: {
          name: error.name,
          message: error.message,
          cause: error.cause,
        }};
      }
      return {id: rpc.id, error};
    }
  }

  private async _handleSingleRpc(rpc: Rpc<any>): Promise<any> {
    const { method, params } = rpc;
    const func = this.rpcs[method];
    if (!func) throw new MethodNotDefinedError(method);

    const validatedParams = func.inputValidation.safeParse(params);
    if (!validatedParams.success) throw new InvalidInputError(validatedParams.error);

    const authResult = await func.auth(rpc);
    if (!authResult.success) throw new AuthenticationError(authResult.result);

    const rateLimitResult = await func.rateLimit(rpc, authResult);
    if (!rateLimitResult.success) throw new RateLimitError(rateLimitResult.result);

    return await func.handle({params: validatedParams.data, authResult, rateLimitResult});
  }
}