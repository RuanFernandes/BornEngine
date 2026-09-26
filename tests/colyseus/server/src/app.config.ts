import { defineRoom, defineServer } from "colyseus";
import { TestRoom } from "./rooms/TestRoom.js";

const server = defineServer({
  rooms: {
    test_room: defineRoom(TestRoom),
  },
});

export default server;
