import { describe, expect, it } from "vitest";
import { formatScheduleAsBusinessHours } from "./workspace-schedule";

describe("formatScheduleAsBusinessHours", () => {
  it("formats Mon-Fri same hours as one line, Vietnamese", () => {
    const result = formatScheduleAsBusinessHours(
      [
        {
          days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
          startTime: "09:00",
          endTime: "17:00",
        },
      ],
      "vi",
    );
    expect(result).toBe("- Thứ 2–Thứ 6: 09:00–17:00");
  });

  it("formats Mon-Fri same hours as one line, English", () => {
    const result = formatScheduleAsBusinessHours(
      [
        {
          days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
          startTime: "09:00",
          endTime: "17:00",
        },
      ],
      "en",
    );
    expect(result).toBe("- Mon–Fri: 09:00–17:00");
  });

  it("formats multiple non-contiguous day groups as separate lines", () => {
    const result = formatScheduleAsBusinessHours(
      [
        { days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], startTime: "09:00", endTime: "17:00" },
        { days: ["Saturday"], startTime: "09:00", endTime: "12:00" },
      ],
      "vi",
    );
    expect(result).toBe("- Thứ 2–Thứ 6: 09:00–17:00\n- Thứ 7: 09:00–12:00");
  });

  it("returns a closed-days notice when availability is empty", () => {
    const result = formatScheduleAsBusinessHours([], "vi");
    expect(result).toBe("- Chưa thiết lập giờ làm việc");
  });
});
