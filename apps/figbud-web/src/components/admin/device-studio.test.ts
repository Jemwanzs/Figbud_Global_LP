import {
  DEFAULT_DEVICE_EXPERIENCE,
  type DevicePreviewConfig,
  framesOf,
  resolveDevicePreview,
} from "@figbud/site-kit";
import { describe, expect, it } from "vitest";

import { screenshotProblem } from "./device-studio";

// Device experience (P14-W8): how sections resolve the website's settings,
// and which screenshots suit which device.

const section: DevicePreviewConfig = {
  devices: ["desktop", "phone"],
  desktop_image_id: "a",
  phone_image_id: "b",
  default_device: "desktop",
  frame: "minimal",
  transitions: true,
  address: "ZiraHR",
};

describe("resolveDevicePreview", () => {
  it("keeps a section's own settings until the website publishes some", () => {
    expect(resolveDevicePreview(section, null)).toBe(section);
    expect(resolveDevicePreview(section, { ...DEFAULT_DEVICE_EXPERIENCE, enabled: false })).toBe(section);
  });

  it("applies the website's settings to inheriting sections, keeping their screenshots and address", () => {
    const r = resolveDevicePreview(section, DEFAULT_DEVICE_EXPERIENCE);
    expect(r.default_device).toBe("phone");
    expect(r.visitor_switching).toBe(false);
    expect(r.transitions).toBe(false);
    expect(r.synchronized_previews).toBe(false);
    expect(r.frames).toEqual(DEFAULT_DEVICE_EXPERIENCE.frames);
    expect(r.desktop_image_id).toBe("a");
    expect(r.address).toBe("ZiraHR");
  });

  it("leaves overriding sections alone", () => {
    const own = { ...section, inherit: false };
    expect(resolveDevicePreview(own, DEFAULT_DEVICE_EXPERIENCE)).toBe(own);
  });

  it("synchronises previews only when visitors may switch", () => {
    const sync = { ...DEFAULT_DEVICE_EXPERIENCE, synchronized_previews: true };
    expect(resolveDevicePreview(section, sync).synchronized_previews).toBe(false);
    expect(resolveDevicePreview(section, { ...sync, visitor_switching: true }).synchronized_previews).toBe(
      true,
    );
  });

  it("maps the original frame styles onto the frame library", () => {
    expect(framesOf({ devices: [] })).toEqual({ desktop: "laptop", tablet: "landscape", phone: "portrait" });
    expect(framesOf({ devices: [], tablet_orientation: "portrait" }).tablet).toBe("portrait");
    expect(framesOf({ devices: [], frame: "minimal" })).toEqual({
      desktop: "browser",
      tablet: "minimal",
      phone: "minimal",
    });
  });
});

describe("screenshotProblem", () => {
  it("accepts screenshots taken at each device's size", () => {
    expect(screenshotProblem("desktop", { width: 1440, height: 900 })).toBeNull();
    expect(screenshotProblem("tablet", { width: 1024, height: 768 })).toBeNull();
    expect(screenshotProblem("tablet", { width: 768, height: 1024 })).toBeNull();
    expect(screenshotProblem("phone", { width: 390, height: 844 })).toBeNull();
    expect(screenshotProblem("phone", { width: 844, height: 390 })).toBeNull();
  });

  it("flags the wrong shape or size", () => {
    expect(screenshotProblem("desktop", { width: 390, height: 844 })).toMatch(/wider/);
    expect(screenshotProblem("desktop", { width: 800, height: 500 })).toMatch(/desktop width/);
    expect(screenshotProblem("tablet", { width: 1440, height: 600 })).toMatch(/4:3/);
    expect(screenshotProblem("phone", { width: 512, height: 512 })).toMatch(/not square/);
    expect(screenshotProblem("phone", { width: 0, height: 0 })).toMatch(/unknown/);
  });
});
