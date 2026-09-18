// 資料列型別。欄位名沿用資料庫的 snake_case，少一層對應就少一個出錯點。

export type MenuSource = "manual" | "vision" | "import";
export type MenuStatus = "draft" | "active" | "archived";
export type SessionStatus = "open" | "locked" | "settled" | "cancelled";
export type OrderLineSource = "natural-language" | "component" | "manual";
export type LedgerKind = "charge" | "payment" | "adjustment";
export type UploadStatus = "pending" | "parsed" | "failed" | "applied";

export type Restaurant = {
  id: number;
  name: string;
  name_key: string;
  aliases: string[];
  phone: string;
  address: string;
  note: string;
  is_active: boolean;
  created_by: string;
  created_at: Date;
  updated_at: Date;
};

export type Menu = {
  id: number;
  restaurant_id: number;
  version: number;
  source: MenuSource;
  status: MenuStatus;
  note: string;
  created_by: string;
  created_at: Date;
  activated_at: Date | null;
};

export type MenuItem = {
  id: number;
  menu_id: number;
  category: string;
  name: string;
  name_key: string;
  price_cents: number;
  unit: string;
  note: string;
  position: number;
  is_available: boolean;
};

/** 尚未入庫的品項（來自人工輸入或視覺辨識）。 */
export type DraftItem = {
  category: string;
  name: string;
  price_cents: number;
  unit: string;
  note: string;
};

export type OrderSession = {
  id: number;
  guild_id: string;
  channel_id: string;
  summary_msg_id: string;
  restaurant_id: number;
  menu_id: number | null;
  title: string;
  status: SessionStatus;
  host_user_id: string;
  deadline_at: Date | null;
  created_at: Date;
  closed_at: Date | null;
};

export type OrderLine = {
  id: number;
  session_id: number;
  discord_user_id: string;
  display_name: string;
  menu_item_id: number | null;
  item_name: string;
  unit_price_cents: number;
  quantity: number;
  note: string;
  source: OrderLineSource;
  created_at: Date;
  updated_at: Date;
};

export type LedgerEntry = {
  id: number;
  session_id: number | null;
  guild_id: string;
  discord_user_id: string;
  kind: LedgerKind;
  amount_cents: number;
  note: string;
  created_by: string;
  created_at: Date;
};

export type LedgerBalance = {
  discord_user_id: string;
  display_name: string;
  charged_cents: number;
  paid_cents: number;
  /** 正數＝多付，負數＝還欠。 */
  balance_cents: number;
};
