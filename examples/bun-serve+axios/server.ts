import { serve } from "bun";
import { RpcHandler, type InferRpc } from "../..";
import { z } from "zod";

class TestError extends Error {
  constructor(message: string, options: ErrorOptions) {
    super(message, options);
    this.name = 'TestError';
  }
}

new Error('TEST_ERROR', {cause: 'just a test'});

const rpc = new RpcHandler({
  health: {
    inputValidation: z.undefined(),
    auth: async () => ({ success: true, result: {} }),
    rateLimit: async () => ({ success: true, result: {} }),
    handle: async () => 'ok',
  },
  greetings: {
    inputValidation: z.object({name: z.string()}),
    auth: async () => ({ success: true, result: {} }),
    rateLimit: async () => ({ success: true, result: {} }),
    handle: async ({ params }) => `Hello ${params.name}`,
  },
  error: {
    inputValidation: z.undefined(),
    auth: async () => ({ success: true, result: {} }),
    rateLimit: async () => ({ success: true, result: {} }),
    handle: async () => { throw new TestError('TEST_ERROR', {cause: 'just a test'}) },
  },
});

const handleBunServe = (handler: RpcHandler<any>) => {
  return async (req: Request): Promise<Response> => {
    const rpcReq = await req.json();
    const results = await handler.handle(rpcReq);
    return new Response(JSON.stringify(results), { status: 200 });
  }
}

export type Rpcs = InferRpc<typeof rpc>;

const server = serve({
  routes: {
    '/rpc': {POST: handleBunServe(rpc)},
  },
});

console.log(`🚀 Server running at ${server.url}`);
