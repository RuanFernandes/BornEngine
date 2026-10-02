import { defineRoom, defineServer } from "@colyseus/core";
import { ChatRoom } from "./rooms/ChatRoom.js";

export default defineServer({
  rooms: {
    chat: defineRoom(ChatRoom),
  },
});
