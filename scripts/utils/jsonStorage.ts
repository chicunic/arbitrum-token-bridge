import fs from 'fs';
import path from 'path';

export declare interface DeployedType {
  l1ProxyAdmin?: string;
  l2ProxyAdmin?: string;
  l1GatewayRouterLogic?: string;
  l1GatewayRouter?: string;
  l2GatewayRouterLogic?: string;
  l2GatewayRouter?: string;
  l1GatewayRouterInitialized?: boolean;
  l2GatewayRouterInitialized?: boolean;
  l1CustomGatewayLogic?: string;
  l1CustomGateway?: string;
  l2CustomGatewayLogic?: string;
  l2CustomGateway?: string;
  l1CustomGatewayInitialized?: boolean;
  l2CustomGatewayInitialized?: boolean;
  l1Token?: string;
  l2Token?: string;
}

export class JsonStorage {
  filepath: string;
  data: DeployedType;

  constructor(filename: string) {
    this.filepath = path.join(__dirname, filename);
    if (fs.existsSync(this.filepath)) {
      this.data = JSON.parse(fs.readFileSync(this.filepath, 'utf8'));
    } else {
      this.data = {};
    }
  }

  get(key: string): any {
    return this.data[key as keyof DeployedType];
  }

  set(key: string, value: any): void {
    this.data[key as keyof DeployedType] = value;
    fs.writeFileSync(this.filepath, JSON.stringify(this.data, null, 2));
  }
}
