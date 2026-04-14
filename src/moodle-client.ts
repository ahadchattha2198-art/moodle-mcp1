import type { Config } from "./config.js";

export interface SiteInfo {
  userid: number;
  username: string;
  sitename: string;
  fullname: string;
}

type MoodleErrorResponse = {
  exception: string;
  errorcode?: string;
  message?: string;
};

export class MoodleClient {
  userId: number = 0;

  private constructor(
    private readonly baseUrl: string,
    private readonly token: string,
  ) {}

  static async create(config: Config): Promise<MoodleClient> {
    const token =
      config.token ??
      (await MoodleClient.login(config.baseUrl, config.username!, config.password!));
    const client = new MoodleClient(config.baseUrl, token);
    const info = await client.call<SiteInfo>("core_webservice_get_site_info");
    client.userId = info.userid;
    return client;
  }

  private static async login(baseUrl: string, username: string, password: string): Promise<string> {
    const url = `${baseUrl}/login/token.php`;
    const body = new URLSearchParams({ username, password, service: "moodle_mobile_app" });
    const res = await fetch(url, { method: "POST", body });
    const data = (await res.json()) as { token?: string; error?: string };
    if (data.error) {
      throw new Error(
        `Moodle login failed: ${data.error}. Check your username, password, and Moodle URL.`
      );
    }
    if (!data.token) {
      throw new Error(
        "Moodle login failed: no token returned. Ensure the Moodle Mobile app service is enabled."
      );
    }
    return data.token;
  }

  async call<T>(wsfunction: string, params: Record<string, string | number | boolean> = {}): Promise<T> {
    const url = `${this.baseUrl}/webservice/rest/server.php`;
    const body = new URLSearchParams({
      wstoken: this.token,
      wsfunction,
      moodlewsrestformat: "json",
      ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
    });
    const res = await fetch(url, { method: "POST", body });
    if (!res.ok) throw new Error(`HTTP ${res.status} from Moodle API`);
    const data = (await res.json()) as T & Partial<MoodleErrorResponse>;
    if (data.exception) {
      if (data.errorcode === "webservicesnotenabled") {
        throw new Error(
          "Web services are not enabled on this Moodle server. Contact your IT department to enable them."
        );
      }
      if (data.errorcode === "invalidtoken") {
        throw new Error("Invalid Moodle token. Check your MOODLE_TOKEN value.");
      }
      throw new Error(`Moodle API error (${data.errorcode ?? "unknown"}): ${data.message ?? "No message"}`);
    }
    return data;
  }

  fileUrl(pluginfileUrl: string): string {
    const url = new URL(pluginfileUrl);
    url.searchParams.set("token", this.token);
    return url.toString();
  }
}
