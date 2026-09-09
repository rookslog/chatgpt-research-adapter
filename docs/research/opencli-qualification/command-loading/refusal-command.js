import { cli, Strategy } from '@jackwener/opencli/registry';
import { CliError } from '@jackwener/opencli/errors';
export const command = cli({
  site: 'chatgpt', name: 'research-standard', strategy: Strategy.UI,
  access: 'write', browser: true, siteSession: 'persistent', navigateBefore: false,
  args: [],
  validateArgs() {
    if (globalThis.__qualification.collisions.length) throw new CliError('FIXTURE_COLLISION', 'Fixture detected duplicate registration', '', 1);
  },
  async func() {
    globalThis.__qualification.callbackCount++;
    await globalThis.__qualification.refusalGate;
    throw new CliError('ERR_STANDARD_DRIVER_UNQUALIFIED', 'Owned loading qualification refuses input', '', 1);
  },
});
