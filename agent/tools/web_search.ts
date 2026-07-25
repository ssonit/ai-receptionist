import { disableTool } from "eve/tools";

/**
 * Booking agent does not need live web search. Leaving Eve's default
 * `webSearch` enabled makes DeepSeek fall back to AI Gateway
 * `gateway.parallel_search`, which DeepSeek does not support and spams
 * "provider-defined tool ... is not supported" warnings every turn.
 */
export default disableTool();
