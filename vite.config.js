import { defineConfig, loadEnv } from 'vite';
import { copyFileSync, cpSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

function copyCustomerAssetMonitorStatic() {
  return {
    name: 'copy-customer-asset-monitor-static',
    writeBundle(outputOptions) {
      const outputDir = outputOptions.dir || resolve(import.meta.dirname, 'dist');
      const moduleRoot = resolve(import.meta.dirname, 'modules/customer-asset-monitor');
      const outputRoot = resolve(outputDir, 'modules/customer-asset-monitor');

      mkdirSync(outputRoot, { recursive: true });
      cpSync(resolve(moduleRoot, 'assets'), resolve(outputRoot, 'assets'), { recursive: true });
      cpSync(resolve(moduleRoot, '_shared'), resolve(outputRoot, '_shared'), { recursive: true });
      copyFileSync(resolve(moduleRoot, '同一品种风险监控.html'), resolve(outputRoot, '同一品种风险监控.html'));
      copyFileSync(resolve(moduleRoot, '预警中心.html'), resolve(outputRoot, '预警中心.html'));
    }
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, import.meta.dirname, '');

  return {
    base: process.env.VITE_BASE_PATH || env.VITE_BASE_PATH || '/',
    plugins: [copyCustomerAssetMonitorStatic()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(import.meta.dirname, 'index.html'),
          cockpit: resolve(import.meta.dirname, 'modules/cockpit/风险子驾驶舱_0805.html'),
          knowledgeCenter: resolve(import.meta.dirname, 'modules/knowledge-center/知识中心.html'),
          customerAssetMonitor: resolve(import.meta.dirname, 'modules/customer-asset-monitor/index.html'),
          valuation: resolve(import.meta.dirname, 'modules/quant/valuation/option-mc-valuation-ui.html'),
          stressTest: resolve(import.meta.dirname, 'modules/quant/stress-test/module.html')
        }
      }
    }
  };
});
