export interface DashboardConfig {
  [key: string]: unknown;
}

export interface SettingsRepository {
  getDashboardConfig(): Promise<DashboardConfig | null>;
  putDashboardConfig(config: DashboardConfig): Promise<void>;
}
