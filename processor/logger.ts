import { red, green, yellow, blue, gray, bold, italic } from "https://deno.land/std/fmt/colors.ts";

export function logParent(message: string, type: "error" | "warn" | "success" | "info" | "verbose" = "info"): void {
  switch (type) {
    case "error":
      console.log(bold(red(message)));
      break;
    case "warn":
      console.log(bold(yellow(message)));
      break;
    case "success":
      console.log(bold(green(message)));
      break;
    case "verbose":
      console.log(bold(italic(gray(message))));
      break;
    case "info":
    default:
      console.log(bold(italic(blue(message))));
      break;
  }
}

export function logChild(message: string, indentLevel: number = 1, type: "error" | "warn" | "success" | "info" | "verbose" = "info"): void {
  const indent = "\t".repeat(indentLevel);
  switch (type) {
    case "error":
      console.log(indent + red(message));
      break;
    case "warn":
      console.log(indent + yellow(message));
      break;
    case "success":
      console.log(indent + green(message));
      break;
    case "verbose":
      console.log(indent + italic(gray(message)));
      break;
    case "info":
    default:
      console.log(indent + italic(blue(message)));
      break;
  }
} 