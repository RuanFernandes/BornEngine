import { defineRoom, defineServer } from "@colyseus/core";
import { ArenaRoom } from "./rooms/ArenaRoom.js";

export default defineServer({
  rooms: {
    arena: defineRoom(ArenaRoom),
  },
});
