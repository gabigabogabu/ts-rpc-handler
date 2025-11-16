import { createRpcClient } from "../..";
import * as amqp from 'amqplib';
import { type Rpcs } from "./worker";

function createAmqpRpcClient<T>({url, queueName}: {url: string, queueName: string}): ReturnType<typeof createRpcClient<T>> {
  return createRpcClient<T>(async (body) => {
    const connection = await amqp.connect(url);
    const channel = await connection.createChannel();
    await channel.assertQueue(queueName);
    const replyQueue = await channel.assertQueue('', { exclusive: true });
    
    const replyPromise = new Promise<string>((resolve) => {
      channel.consume(replyQueue.queue, (msg) => {
        if (!msg) return;
        const body = msg.content.toString();
        channel.close();
        connection.close();
        resolve(body);
      });
    });

    channel.sendToQueue(queueName, Buffer.from(JSON.stringify(body)), { replyTo: replyQueue.queue });
    return replyPromise;
  });
}

const client = createAmqpRpcClient<Rpcs>({url: 'amqp://localhost', queueName: 'rpc'});

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

