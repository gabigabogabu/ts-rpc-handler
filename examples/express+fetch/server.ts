import express, { type Request, type Response } from "express";
import { RpcHandler, type InferRpc } from "../..";
import { z } from "zod";

const app = express();

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

export type Rpcs = InferRpc<typeof rpc>;

const handleExpress = (handler: RpcHandler<any>) => {
  return async (req: Request, res: Response): Promise<Response> => {
    const results = await handler.handle(req.body);
    return res.json(results);
  }
}

app.use(express.json());
app.post('/rpc', handleExpress(rpc));

app.listen(3000, () => {
  console.log(`🚀 Server running at http://localhost:3000`);
});
