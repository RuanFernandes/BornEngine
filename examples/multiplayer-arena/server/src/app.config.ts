import { defineRoom, defineServer } from "colyseus";
import { ArenaRoom } from "./rooms/ArenaRoom.js";

export default defineServer({
  rooms: {
    arena: defineRoom(ArenaRoom),
  },
});
