import {
  SUPABASE_URL,
  SUPABASE_KEY,
  SMSAPI_TOKEN,
  SMS_PROVIDER,
  SMS_WEBHOOK_SECRET,
  SMS_WORKER_TOKEN,
} from "astro:env/server";

import { usesRealSms } from "@/lib/sms";

export interface ConfigStatus {
  name: string;
  configured: boolean;
  message: string;
  /** Who sees the banner. "coordinator" keeps an operational notice away from residents and visitors. */
  audience: "everyone" | "coordinator";
  variant: "info" | "warning" | "error";
  docsUrl?: string;
  docsLabel?: string;
}

export const configStatuses: ConfigStatus[] = [
  {
    name: "Supabase",
    configured: Boolean(SUPABASE_URL && SUPABASE_KEY),
    message: "Supabase nie jest skonfigurowany — funkcje uwierzytelniania są wyłączone.",
    audience: "everyone",
    variant: "error",
    docsUrl: "https://github.com/BarWyDev/skill_net#supabase-setup",
    docsLabel: "Zobacz instrukcję konfiguracji",
  },
  {
    // Real SMS needs the provider token, the callbacks' path secret and the worker token together.
    name: "SMS",
    configured: usesRealSms({ SMSAPI_TOKEN, SMS_PROVIDER }) && Boolean(SMS_WEBHOOK_SECRET) && Boolean(SMS_WORKER_TOKEN),
    message: "SMS nie jest skonfigurowany — alerty i weryfikacja numeru działają w trybie testowym.",
    audience: "coordinator",
    variant: "warning",
  },
];

export const missingConfigs = configStatuses.filter((s) => !s.configured);

/** The banners one visitor should see: coordinator-only notices are hidden from everyone else. */
export function missingConfigsFor(isCoordinator: boolean): ConfigStatus[] {
  return missingConfigs.filter((s) => s.audience === "everyone" || isCoordinator);
}
