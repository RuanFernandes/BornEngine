import type { Application, Request, Response } from 'express';
import { defineRoom, defineServer } from '@colyseus/core';
import { SandboxRoom } from './rooms/SandboxRoom.js';

function registerHealthRoute(app: Application): void {
  app.get('/health', (_request: Request, response: Response) => {
    response.json({ status: 'ok' });
  });
}

export default defineServer({
  rooms: {
    sandbox: defineRoom(SandboxRoom),
  },
  express: registerHealthRoute,
});
