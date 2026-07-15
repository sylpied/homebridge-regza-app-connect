export declare const MEDIA_RENDERER_DEVICE_TYPE = "urn:schemas-upnp-org:device:MediaRenderer:1";
interface SsdpResponse {
    address: string;
    searchTarget: string;
}
export declare function parseSsdpResponse(message: Buffer, address: string): SsdpResponse;
export declare function isMediaRendererResponse(response: SsdpResponse, expectedIp: string): boolean;
/**
 * Sends one targeted SSDP query. On 55J10X the MediaRenderer service exists
 * while the panel is active, including HDMI playback, but disappears in
 * standby. MediaServer is deliberately not used because it may remain active
 * in standby.
 */
export declare function probeMediaRenderer(expectedIp: string, timeoutMs?: number): Promise<boolean>;
export {};
