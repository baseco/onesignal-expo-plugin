/**
 * Expo config plugin for One Signal (iOS)
 * @see https://documentation.onesignal.com/docs/react-native-sdk-setup#step-4-install-for-ios-using-cocoapods-for-ios-apps
 */

import {
  ConfigPlugin,
  withEntitlementsPlist,
  withXcodeProject,
} from "@expo/config-plugins";
import * as fs from 'fs';
import * as path from 'path';
import xcode from 'xcode';
import {
  DEFAULT_BUNDLE_SHORT_VERSION,
  DEFAULT_BUNDLE_VERSION,
  IPHONEOS_DEPLOYMENT_TARGET,
  NSE_TARGET_NAME,
  TARGETED_DEVICE_FAMILY
} from "../support/iosConstants";
// import { updatePodfile } from "../support/updatePodfile";
import NseUpdaterManager from "../support/NseUpdaterManager";
import { OneSignalLog } from "../support/OneSignalLog";
import { FileManager } from "../support/FileManager";
import { OneSignalPluginProps, PluginOptions } from "../types/types";




export const withOneSignalIos: ConfigPlugin<OneSignalPluginProps> = (
  config,
  props
) => {
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
      iosNSEFilePath: props.iosNSEFilePath
    };

    // support for monorepos where node_modules can be above the project directory.
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


  console.log("OPTIONS:", options)
  console.log("appName", appName)
  console.log("sourceDir: ", sourceDir)

  const { iosPath, devTeam, bundleIdentifier, bundleVersion, bundleShortVersion, iPhoneDeploymentTarget, iosNSEFilePath } = options;

  // not awaiting in order to not block main thread
  // updatePodfile(iosPath).catch(err => { OneSignalLog.error(err) });

  const projPath = `${iosPath}/${appName}.xcodeproj/project.pbxproj`;

  const sourceFile = "NotificationService.m"
  const extFiles = [
    "NotificationService.h",
    `${NSE_TARGET_NAME}.entitlements`,
    `${NSE_TARGET_NAME}-Info.plist`
  ];

  const xcodeProject = xcode.project(projPath);

  xcodeProject.parse(async function(err: Error) {
    if (err) {
      OneSignalLog.log(`Error parsing iOS project: ${JSON.stringify(err)}`);
      return;
    }

    /* COPY OVER EXTENSION FILES */
    fs.mkdirSync(`${iosPath}/${NSE_TARGET_NAME}`, { recursive: true });

    for (let i = 0; i < extFiles.length; i++) {
      const extFile = extFiles[i];
      const targetFile = `${iosPath}/${NSE_TARGET_NAME}/${extFile}`;
      await FileManager.copyFile(`${sourceDir}${extFile}`, targetFile);
    }

    // Copy NSE source file either from configuration-provided location, falling back to the default one.
    const sourcePath = iosNSEFilePath ?? `${sourceDir}${sourceFile}`
    const targetFile = `${iosPath}/${NSE_TARGET_NAME}/${sourceFile}`;
    await FileManager.copyFile(`${sourcePath}`, targetFile);

    /* MODIFY COPIED EXTENSION FILES */
    const nseUpdater = new NseUpdaterManager(iosPath);
    await nseUpdater.updateNSEEntitlements(`group.${bundleIdentifier}.onesignal`)
    await nseUpdater.updateNSEBundleVersion(bundleVersion ?? DEFAULT_BUNDLE_VERSION);
    await nseUpdater.updateNSEBundleShortVersion(bundleShortVersion ?? DEFAULT_BUNDLE_SHORT_VERSION);

    // Create new PBXGroup for the extension
    const extGroup = xcodeProject.addPbxGroup([...extFiles, sourceFile], NSE_TARGET_NAME, NSE_TARGET_NAME);

    // Add the new PBXGroup to the top level group. This makes the
    // files / folder appear in the file explorer in Xcode.
    const groups = xcodeProject.hash.project.objects["PBXGroup"];
    Object.keys(groups).forEach(function(key) {
      if (groups[key].name === undefined) {
        xcodeProject.addToPbxGroup(extGroup.uuid, key);
      }
    });

    // WORK AROUND for codeProject.addTarget BUG
    // Xcode projects don't contain these if there is only one target
    // An upstream fix should be made to the code referenced in this link:
    //   - https://github.com/apache/cordova-node-xcode/blob/8b98cabc5978359db88dc9ff2d4c015cba40f150/lib/pbxProject.js#L860
    const projObjects = xcodeProject.hash.project.objects;
    projObjects['PBXTargetDependency'] = projObjects['PBXTargetDependency'] || {};
    projObjects['PBXContainerItemProxy'] = projObjects['PBXTargetDependency'] || {};

    if (!!xcodeProject.pbxTargetByName(NSE_TARGET_NAME)) {
      OneSignalLog.log(`${NSE_TARGET_NAME} already exists in project. Skipping...`);
      return;
    }

    // Add the NSE target
    // This adds PBXTargetDependency and PBXContainerItemProxy for you
    const nseTarget = xcodeProject.addTarget(NSE_TARGET_NAME, "app_extension", NSE_TARGET_NAME, `${bundleIdentifier}.${NSE_TARGET_NAME}`);

    // Add build phases to the new target
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

    // Edit the Deployment info of the new Target, only IphoneOS and Targeted Device Family
    // However, can be more
    const configurations = xcodeProject.pbxXCBuildConfigurationSection();
    for (const key in configurations) {
      if (
        typeof configurations[key].buildSettings !== "undefined" &&
        configurations[key].buildSettings.PRODUCT_NAME == `"${NSE_TARGET_NAME}"`
      ) {
        const buildSettingsObj = configurations[key].buildSettings;
        buildSettingsObj.DEVELOPMENT_TEAM = devTeam;
        buildSettingsObj.IPHONEOS_DEPLOYMENT_TARGET = iPhoneDeploymentTarget ?? IPHONEOS_DEPLOYMENT_TARGET;
        buildSettingsObj.TARGETED_DEVICE_FAMILY = TARGETED_DEVICE_FAMILY;
        buildSettingsObj.CODE_SIGN_ENTITLEMENTS = `${NSE_TARGET_NAME}/${NSE_TARGET_NAME}.entitlements`;
        buildSettingsObj.CODE_SIGN_STYLE = "Automatic";
      }
    }

    // Add development teams to both your target and the original project
    xcodeProject.addTargetAttribute("DevelopmentTeam", devTeam, nseTarget);
    xcodeProject.addTargetAttribute("DevelopmentTeam", devTeam);

    fs.writeFileSync(projPath, xcodeProject.writeSync());
  })
}
