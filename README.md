# ts RPC handler

simple server

```ts
import { serve } from "bun";
import { RpcHandler, type InferRpc } from "../..";
import { z } from "zod";

const rpc = new RpcHandler({
  greetings: {
    inputValidation: z.object({name: z.string()}),
    auth: async () => ({ success: true, result: {} }),
    rateLimit: async () => ({ success: true, result: {} }),
    handle: async ({ params }) => `Hello ${params.name}`,
  },
});

const handleBunServe = (handler: RpcHandler<any>) => {
  return async (req: Request): Promise<Response> => {
    const rpcReq = await req.json();
    const results = await handler.handle(rpcReq);
    return new Response(JSON.stringify(results), { status: 200 });
  }
}

// only export type to client
export type Rpcs = InferRpc<typeof rpc>;

const server = serve({
  routes: {
    '/rpc': {POST: handleBunServe(rpc)},
  },
});

console.log(`🚀 Server running at ${server.url}`);
```

simple client:
```ts
import { createRpcClient } from "../..";
import { type Rpcs } from "./server";

function createFetchRpcClient<T>(url: string): ReturnType<typeof createRpcClient<T>> {
  return createRpcClient<T>(async (body) => {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return await response.text();
  });
}

const client = createFetchRpcClient<Rpcs>('http://localhost:3000/rpc');

const result2 = await client.greetings({name: 'John'});
console.log(result2);
// > 'Hello John'
```
