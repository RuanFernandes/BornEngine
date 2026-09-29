import { listen } from "@colyseus/tools";
import app from "./app.config.js";

process.env.HOST ??= "127.0.0.1";
process.env.PORT ??= "2569";

await listen(app);
