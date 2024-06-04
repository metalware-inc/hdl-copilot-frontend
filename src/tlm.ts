import { PostHog } from 'posthog-node'
import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';

let extensionVersion: string = "unknown";
let licenseKeyCache: string | null = null;

const tlmClient = new PostHog (
    'phc_NHamavvbaDiUR5KU2rqxLCkE2yNRNJHHSaeoZbZfgbp',
    { host: 'https://app.posthog.com' });

let cacheMacAddress: string | null = null;

export function setExtensionVersion(version: string) {
  extensionVersion = version;
}

export function setLicenseKey(licenseKey: string) {
    licenseKeyCache = licenseKey;
}

function getMacAddress(): string {
    if (cacheMacAddress) {
        return cacheMacAddress;
    }
    const networkInterfaces = os.networkInterfaces();
    for (const iface in networkInterfaces) {
        const addresses: any = networkInterfaces[iface];
        for (const addr of addresses) {
            if (addr.family === 'IPv4' && !addr.internal) {
                cacheMacAddress = addr.mac;
                break;
            }
        }
    }
    return cacheMacAddress || uuidv4();
}

export function sendTlm(event: string, properties: any = {}, flush_async: boolean = true) {
    properties.host = os.hostname();
    properties.platform = os.platform();
    properties.arch = os.arch();
    properties.product = 'vscode-hdl-copilot';
    properties.plugin_version = extensionVersion;
    if (licenseKeyCache) {
        properties.license_key = licenseKeyCache;
    }

    tlmClient.capture({
        distinctId: getMacAddress(),
        event: event,
        properties: properties
    });
    if (!flush_async) {
        tlmClient.flushAsync();
    } else {
        tlmClient.flush();
    }
}