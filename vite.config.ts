import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  define: {
    // 编译期常量：native 构建（vite build --mode native）时为 true，网页构建时为 false。
    // 构建工具会把 false 分支直接摇树删除，两侧产物互不包含对方的逻辑。
    __CAPACITOR__: JSON.stringify(mode === "native"),
  },
}));
