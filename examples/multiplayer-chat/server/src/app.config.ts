import { defineRoom, defineServer } from "colyseus";
import { ChatRoom } from "./rooms/ChatRoom.js";

export default defineServer({
  rooms: {
    chat: defineRoom(ChatRoom),
  },
});
