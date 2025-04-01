import { importTypes } from '@rancher/auto-import';
import { IPlugin } from '@shell/core/types';

const ID = 'vcd';

// Init the package
export default function(plugin: IPlugin): void {
  // Auto-import model, detail, edit from the folders
  importTypes(plugin);

  // Provide plugin metadata from package.json
  plugin.metadata = require('./package.json');
  plugin.register('image', 'providers/vcd.png', require('./vcd.png'));

  // Load a product
  // plugin.addProduct(require('./product'));
}
