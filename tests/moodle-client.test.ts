import { describe, it, expect, vi, beforeEach } from "vitest";
import { MoodleClient } from "../src/moodle-client.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function mockOkJson(data: unknown) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(data),
  });
}

describe("MoodleClient.create with token", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches site info and exposes userId", async () => {
    mockFetch.mockResolvedValueOnce(mockOkJson({
      userid: 42,
      username: "student",
      sitename: "My Uni",
      fullname: "Alice Smith",
    }));

    const client = await MoodleClient.create({
      baseUrl: "https://moodle.uni.edu",
      token: "tok123",
    });

    expect(client.userId).toBe(42);
    expect(mockFetch).toHaveBeenCalledOnce();
  });
});

describe("MoodleClient.create with username+password", () => {
  beforeEach(() => vi.clearAllMocks());

  it("POSTs to /login/token.php then fetches site info", async () => {
    mockFetch
      .mockResolvedValueOnce(mockOkJson({ token: "fetched-token" }))
      .mockResolvedValueOnce(mockOkJson({
        userid: 7, username: "bob", sitename: "Uni", fullname: "Bob",
      }));

    const client = await MoodleClient.create({
      baseUrl: "https://moodle.uni.edu",
      username: "bob",
      password: "pass",
    });

    expect(client.userId).toBe(7);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const loginCall = mockFetch.mock.calls[0];
    expect(loginCall[0]).toContain("/login/token.php");
  });

  it("throws descriptive error on login failure", async () => {
    mockFetch.mockResolvedValueOnce(mockOkJson({ error: "Invalid login" }));

    await expect(
      MoodleClient.create({ baseUrl: "https://moodle.uni.edu", username: "x", password: "y" })
    ).rejects.toThrow("Invalid login");
  });
});

describe("MoodleClient.call", () => {
  beforeEach(() => vi.clearAllMocks());

  async function makeClient() {
    mockFetch.mockResolvedValueOnce(mockOkJson({ userid: 1, username: "a", sitename: "b", fullname: "c" }));
    return MoodleClient.create({ baseUrl: "https://moodle.uni.edu", token: "t" });
  }

  it("throws on webservicesnotenabled error", async () => {
    const client = await makeClient();
    mockFetch.mockResolvedValueOnce(mockOkJson({
      exception: "moodle_exception",
      errorcode: "webservicesnotenabled",
      message: "Web services are disabled",
    }));
    await expect(client.call("any_function")).rejects.toThrow("Web services are not enabled");
  });

  it("throws on invalidtoken error", async () => {
    const client = await makeClient();
    mockFetch.mockResolvedValueOnce(mockOkJson({
      exception: "moodle_exception",
      errorcode: "invalidtoken",
      message: "Invalid token",
    }));
    await expect(client.call("any_function")).rejects.toThrow("Invalid Moodle token");
  });

  it("returns typed response on success", async () => {
    const client = await makeClient();
    mockFetch.mockResolvedValueOnce(mockOkJson([{ id: 1, fullname: "Math 101" }]));
    const result = await client.call<{ id: number; fullname: string }[]>("core_enrol_get_users_courses", { userid: 1 });
    expect(result[0].fullname).toBe("Math 101");
  });
});

describe("MoodleClient.fileUrl", () => {
  it("appends token to pluginfile URL", async () => {
    mockFetch.mockResolvedValueOnce(mockOkJson({ userid: 1, username: "a", sitename: "b", fullname: "c" }));
    const client = await MoodleClient.create({ baseUrl: "https://moodle.uni.edu", token: "mytoken" });
    const url = client.fileUrl("https://moodle.uni.edu/pluginfile.php/5/course/section/0/notes.pdf");
    expect(url).toContain("token=mytoken");
  });
});
