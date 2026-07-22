import { defineSandbox } from "eve/sandbox";
import { justbash } from "eve/sandbox/just-bash";

/**
 * Booking chat does not need Docker. Force just-bash so local turns
 * do not stall on Docker image prewarm.
 */
export default defineSandbox({
  backend: justbash(),
});
