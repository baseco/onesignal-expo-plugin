import {
  ConfigPlugin,
  withEntitlementsPlist,
  withXcodeProject,
} from "@expo/config-plugins";
import * as fs from 'fs';
import * as path from 'path';
import xcode from 'xcode';
import { FileManager } from "../support/FileManager";


 export type OneSignalPluginProps = {
  mode: Mode;
  devTeam: string;
  iPhoneDeploymentTarget: string;
};

export type PluginOptions = {
  iosPath:                  string,
  mode:                     Mode,
  devTeam?:                 string,
  bundleVersion?:           string,
  bundleShortVersion?:      string,
  bundleIdentifier?:        string,
  iPhoneDeploymentTarget?:  string,
}

export enum Mode {
  Dev = "development",
  Prod = "production"
}

const withOneSignal: ConfigPlugin<OneSignalPluginProps> = (config, props) => {
  withEntitlementsPlist(config, (newConfig) => {
    newConfig.modResults["aps-environment"] = props.mode;
    return newConfig;
  });

  withXcodeProject(config, async configProps => {
    const options: PluginOptions = {
      iosPath: configProps.modRequest.platformProjectRoot,
      bundleIdentifier: configProps.ios?.bundleIdentifier,
      devTeam: props?.devTeam,
      bundleVersion: configProps.ios?.buildNumber,
      bundleShortVersion: configProps?.version,
      mode: props?.mode,
      iPhoneDeploymentTarget: props?.iPhoneDeploymentTarget,
    };

    const pluginDir = require.resolve("onesignal-expo-plugin/package.json")

    xcodeProjectAddNse(
      configProps.modRequest.projectName || "",
      options,
      path.join(pluginDir, "../build/support/serviceExtensionFiles/")
    );

    return configProps;
  });


  return config;
};


export function xcodeProjectAddNse(
  appName: string,
  options: PluginOptions,
  sourceDir: string
): void {

  const entitlementsFileName =`OneSignalNotificationServiceExtension.entitlements`;

  const { iosPath, devTeam, bundleIdentifier,  } = options;

  const nsePath = `${iosPath}/OneSignalNotificationServiceExtension`

  const projPath = `${iosPath}/${appName}.xcodeproj/project.pbxproj`;

  const files = [
    "NotificationService.h",
    "NotificationService.m",
    `OneSignalNotificationServiceExtension.entitlements`,
    `OneSignalNotificationServiceExtension-Info.plist`
  ];

  const xcodeProject = xcode.project(projPath);

  xcodeProject.parse(async function(err: Error) {
    if (err) {
      console.log(`Error parsing iOS project: ${JSON.stringify(err)}`);
      return;
    }

    fs.mkdirSync(`${iosPath}/OneSignalNotificationServiceExtension`, { recursive: true });

    const targetFileHeader = `${iosPath}/OneSignalNotificationServiceExtension/NotificationService.h`;
    await FileManager.copyFile(`${sourceDir}NotificationService.h`, targetFileHeader);

    const targetFileEntitlements = `${iosPath}/OneSignalNotificationServiceExtension/OneSignalNotificationServiceExtension.entitlements`;
    await FileManager.copyFile(`${sourceDir}OneSignalNotificationServiceExtension.entitlements`, targetFileEntitlements);

    const targetFilePlist = `${iosPath}/OneSignalNotificationServiceExtension/OneSignalNotificationServiceExtension-Info.plist`;
    await FileManager.copyFile(`${sourceDir}OneSignalNotificationServiceExtension-Info.plist`, targetFilePlist);

    const sourcePath = `${sourceDir}NotificationService.m`
    const targetFile = `${iosPath}/OneSignalNotificationServiceExtension/NotificationService.m`;
    await FileManager.copyFile(`${sourcePath}`, targetFile);

    const entitlementsFilePath = `${nsePath}/${entitlementsFileName}`;
    let entitlementsFile = await FileManager.readFile(entitlementsFilePath);
    entitlementsFile = entitlementsFile.replace(/{{GROUP_IDENTIFIER}}/gm, `group.${bundleIdentifier}.onesignal`);
    await FileManager.writeFile(entitlementsFilePath, entitlementsFile);

    const extGroup = xcodeProject.addPbxGroup(files, "OneSignalNotificationServiceExtension", "OneSignalNotificationServiceExtension");

    const groups = xcodeProject.hash.project.objects["PBXGroup"];

    Object.keys(groups).forEach(function(key) {
      if (groups[key].name === undefined) {
        xcodeProject.addToPbxGroup(extGroup.uuid, key);
      }
    });

    const nseTarget = xcodeProject.addTarget("OneSignalNotificationServiceExtension", "app_extension", "OneSignalNotificationServiceExtension", `${bundleIdentifier}.OneSignalNotificationServiceExtension`);

    xcodeProject.addBuildPhase(
      ["NotificationService.m"],
      "PBXSourcesBuildPhase",
      "Sources",
      nseTarget.uuid
    );
    xcodeProject.addBuildPhase([], "PBXResourcesBuildPhase", "Resources", nseTarget.uuid);

    xcodeProject.addBuildPhase(
      [],
      "PBXFrameworksBuildPhase",
      "Frameworks",
      nseTarget.uuid
    );

    xcodeProject.addTargetAttribute("DevelopmentTeam", devTeam, nseTarget);
    xcodeProject.addTargetAttribute("DevelopmentTeam", devTeam);

    fs.writeFileSync(projPath, xcodeProject.writeSync());
  })
}

export default withOneSignal;
