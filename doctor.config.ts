import type { ReactDoctorConfig } from "react-doctor";

const config: ReactDoctorConfig = {
  ignore: {
    files: [
      "apps/**",
      "packages/**",
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
