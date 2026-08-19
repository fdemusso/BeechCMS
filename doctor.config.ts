import type { ReactDoctorConfig } from "react-doctor";

const config: ReactDoctorConfig = {
  projects: ["apps/dashboard"],
  ignore: {
    files: [
      "docs/**",
      "docs/.vitepress/**",
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      ".next/**",
    ],
  },
};

export default config;
