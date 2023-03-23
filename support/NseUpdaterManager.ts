import { FileManager } from './FileManager';

// project `ios/OneSignalNotificationServiceExtension` directory
const entitlementsFileName =`OneSignalNotificationServiceExtension.entitlements`;
const plistFileName = `OneSignalNotificationServiceExtension-Info.plist`;

export default class NseUpdaterManager {
  private nsePath = '';
  constructor(iosPath: string) {
    this.nsePath = `${iosPath}/OneSignalNotificationServiceExtension`;
  }

  async updateNSEEntitlements(groupIdentifier: string): Promise<void> {
    const entitlementsFilePath = `${this.nsePath}/${entitlementsFileName}`;
    let entitlementsFile = await FileManager.readFile(entitlementsFilePath);

    entitlementsFile = entitlementsFile.replace(/{{GROUP_IDENTIFIER}}/gm, groupIdentifier);
    await FileManager.writeFile(entitlementsFilePath, entitlementsFile);
  }

  async updateNSEBundleVersion(version: string): Promise<void> {
    const plistFilePath = `${this.nsePath}/${plistFileName}`;
    let plistFile = await FileManager.readFile(plistFilePath);
    plistFile = plistFile.replace(/{{BUNDLE_VERSION}}/gm, version);
    await FileManager.writeFile(plistFilePath, plistFile);
  }

  async updateNSEBundleShortVersion(version: string): Promise<void> {
    const plistFilePath = `${this.nsePath}/${plistFileName}`;
    let plistFile = await FileManager.readFile(plistFilePath);
    plistFile = plistFile.replace(/{{BUNDLE_SHORT_VERSION}}/gm, version);
    await FileManager.writeFile(plistFilePath, plistFile);
  }
}
