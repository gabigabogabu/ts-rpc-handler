import * as amqp from 'amqplib';
import { RpcHandler, type InferRpc } from "../..";
import { z } from "zod";

class TestError extends Error {
  constructor(message: string, options: ErrorOptions) {
    super(message, options);
    this.name = 'TestError';
  }
}

// AMQP connection
const connection = await amqp.connect('amqp://localhost');
const channel = await connection.createChannel();
const queue = await channel.assertQueue('rpc');

// RPC handler
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

const handleAmqp = (handler: RpcHandler<any>) => {
  return async (msg: amqp.ConsumeMessage | null) => {
    if (!msg) return;
    const { correlationId, replyTo } = msg.properties;
    const message = msg.content.toString();
    const rpcReq = JSON.parse(message);
    const results = await handler.handle(rpcReq);
    channel.ack(msg);
    channel.sendToQueue(replyTo, Buffer.from(JSON.stringify(results)), { correlationId });
  }
}

channel.consume(queue.queue, handleAmqp(rpc));
console.log('worker started');