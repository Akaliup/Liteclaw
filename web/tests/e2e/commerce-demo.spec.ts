import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 1440, height: 1000 }, isMobile: false });

test('public demo works without backend calls and real workspace still requires login', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  const apiCalls: string[] = [];
  const errors: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/'))
      apiCalls.push(request.url());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '运营总览.' })).toBeVisible();
  await expect(
    page.getByText('任务、评分与运行指标均为示例数据'),
  ).toBeVisible();
  expect(apiCalls).toEqual([]);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: '../docs/screenshots/commerce-demo.png',
    animations: 'disabled',
  });

  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ status: 401, json: { error: 'Unauthorized' } }),
  );
  await page.route('**/api/auth/status', (route) =>
    route.fulfill({ json: { initialized: true } }),
  );
  await page.route('**/api/auth/register/status', (route) =>
    route.fulfill({
      json: { allowRegistration: false, requireInviteCode: true },
    }),
  );
  await page.getByRole('link', { name: '进入真实工作台' }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test('create a scoped employee, persist it and inspect its independent workspace', async ({
  page,
}) => {
  await page.goto('/demo/agents');
  await page.getByRole('button', { name: '创建数字员工', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('员工名称').fill('测试客服');
  await dialog.getByLabel('店铺工作区').selectOption('mori');
  await dialog.getByRole('button', { name: '创建演示员工' }).click();
  await expect(
    page.getByRole('heading', { name: '测试客服', exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: '测试客服', exact: true }),
  ).toBeVisible();
  await page.getByLabel('选择店铺').selectOption('northstar');
  await expect(
    page.getByRole('heading', { name: '测试客服', exact: true }),
  ).toHaveCount(0);
  await page.getByLabel('选择店铺').selectOption('mori');
  await expect(
    page.getByRole('heading', { name: '测试客服', exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: '店铺工作区', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: '工作区目录', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.hm-workspace-table tbody tr')).toHaveCount(4);
  await page
    .getByRole('button', { name: '查看 MORI 森物 客服专员 工作区' })
    .last()
    .click();
  await expect(dialog.getByText('测试客服', { exact: true })).toBeVisible();
  await expect(dialog.locator('code')).toContainText('demo/mori/');
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
});

test('task replay, prompt preview and benchmark export are interactive and labeled', async ({
  page,
}) => {
  await page.goto('/demo/agents');
  await page.getByRole('button', { name: '查看 客户体验专员 配置' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'TOOLS', exact: true }).click();
  await expect(dialog.getByText('## TOOLS', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: '回放岗位任务' }).click();
  await dialog.getByRole('button', { name: '回放任务样例' }).click();
  await expect(dialog.getByText('示例任务结果', { exact: true })).toBeVisible({
    timeout: 8000,
  });
  await expect(
    dialog.getByText('仅为预置样例 不构成实际业务结论'),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('link', { name: '模型评测', exact: true }).click();
  await expect(page.getByRole('heading', { name: '模型评测.' })).toBeVisible();
  await page.getByRole('button', { name: '广告优化师', exact: true }).click();
  await expect(page.locator('.hm-case-row')).toHaveCount(3);
  await expect(page.locator('.hm-case-row').first()).toContainText('AD-001');
  await page.getByRole('button', { name: '回放示例评测' }).click();
  await expect(
    page.getByText('示例评测回放完成 已展示预置评分矩阵'),
  ).toBeVisible({ timeout: 8000 });
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出矩阵', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain('非实测.csv');
});

test('provider fault replay switches to fallback and can reset', async ({
  page,
}) => {
  await page.goto('/demo/runtime');
  await page.getByRole('button', { name: '模拟 Provider 故障' }).click();
  await expect(
    page.getByRole('heading', { name: '故障切换回放完成' }),
  ).toBeVisible({ timeout: 8000 });
  await expect(page.locator('.hm-provider-target.failed')).toContainText('GPT');
  await expect(page.locator('.hm-provider-target.selected')).toContainText(
    'Claude',
  );
  await expect(page.getByText('已隔离', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '恢复演示状态' }).click();
  await expect(
    page.getByRole('heading', { name: '运行链路 准备就绪' }),
  ).toBeVisible();
  await expect(page.locator('.hm-provider-target.selected')).toContainText(
    'GPT',
  );
  await page.getByLabel('路由策略演示').selectOption('weighted');
  await expect(page.getByText('按配置权重选择健康节点')).toBeVisible();
});

test('mobile navigation, filtering and dialog fit the viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/demo');
  await page.getByRole('button', { name: '打开导航' }).click();
  await page.getByRole('link', { name: '数字员工', exact: true }).click();
  await expect(page.getByRole('heading', { name: '数字员工.' })).toBeVisible();
  await page.getByLabel('搜索当前页面').fill('选品');
  await expect(page.locator('.hm-agent-card')).toHaveCount(1);
  await page.getByRole('button', { name: '岗位配置', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const bounds = await dialog.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
});
