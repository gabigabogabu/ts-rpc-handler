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

const result = await client.health();
console.log(result);
// > 'ok'

const result2 = await client.greetings({name: 'John'});
console.log(result2);
// > 'Hello John'

const result3 = await client.error().catch(e => ({
  id: e.id,
  message: e.message,
  name: e.name,
  cause: e.cause,
  stack: e.stack,
}));
console.error(result3);
/** >
{
  id: "c<...>_2",
  message: "[c<...>_2] error: RPC error: TEST_ERROR",
  name: 'TestError',
  cause: "just a test",
  stack: "TestError: [c<...>_2] error: RPC error: TEST_ERROR\n    at <anonymous> (<omitted>/bunrpc/bunRpcClient.ts:52:21)",
}
 */