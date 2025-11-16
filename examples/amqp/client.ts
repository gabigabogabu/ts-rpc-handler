import { createRpcClient } from "../..";
import * as amqp from 'amqplib';
import { type Rpcs } from "./worker";
import { EventEmitter } from "events";

function createAmqpRpcClient<T>({url, queueName}: {url: string, queueName: string}): ReturnType<typeof createRpcClient<T>> {
  return createRpcClient<T>(async (body) => {
    const connection = await amqp.connect(url);
    const channel = await connection.createChannel();
    await channel.assertQueue(queueName);
    const replyQueue = await channel.assertQueue('', { exclusive: true });
  
    const replyEmitter = new EventEmitter();
  
    channel.consume(replyQueue.queue, (msg) => {
      if (!msg) return;
      const correlationId = msg.properties.correlationId;
      const body = msg.content.toString();
      replyEmitter.emit(correlationId, body);
    });

    const correlationId = crypto.randomUUID();
    channel.sendToQueue(queueName, Buffer.from(JSON.stringify(body)), { replyTo: replyQueue.queue, correlationId });
    
    const replyPromise = new Promise<string>((resolve) => {
      replyEmitter.once(correlationId, (body) => {
        channel.close();
        connection.close();
        resolve(body);
      });
    });
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

