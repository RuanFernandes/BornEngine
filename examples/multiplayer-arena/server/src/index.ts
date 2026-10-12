import { listen } from "@colyseus/tools";
import app from "./app.config.js";

process.env.PORT ??= "2568";

await listen(app);
