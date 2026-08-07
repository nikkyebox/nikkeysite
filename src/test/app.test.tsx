import React from "react";
import { describe, it } from "vitest";
import { render } from "@testing-library/react";
import App from "../App";

describe("App", () => {
  it("renders without crashing", () => {
    try {
      render(<App />);
    } catch (e) {
      console.error("RUNTIME RENDER CRASH DETECTED:", e);
      throw e;
    }
  });
});
