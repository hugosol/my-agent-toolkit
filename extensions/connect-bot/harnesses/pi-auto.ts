import { connectBotPi } from "./pi-assembly";
import { AUTOMATIC_STARTUP_POLICY } from "./startup-modes";

export default connectBotPi(AUTOMATIC_STARTUP_POLICY);
