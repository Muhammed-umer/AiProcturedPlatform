/** What each warning is called wherever staff see one. */
export const VIOLATION_LABEL: Record<string, string> = {
  tab_switch: "Switched tab",
  window_blur: "Lost focus",
  fullscreen_exit: "Left full screen",
  copy_paste: "Copy or paste",
  devtools: "Developer tools",
  print_screen: "Screenshot",
  no_face: "No face visible",
  multiple_faces: "More than one face",
  looking_away: "Turned away",
  camera_off: "Camera turned off",
};

export const CAMERA_VIOLATIONS = new Set([
  "no_face",
  "multiple_faces",
  "looking_away",
  "camera_off",
]);
