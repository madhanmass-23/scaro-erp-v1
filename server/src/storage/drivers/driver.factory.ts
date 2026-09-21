import { IStorageDriver } from "./storage.driver.interface.js";
import { LocalStorageDriver } from "./local.driver.js";
import { config } from "../../config/env.js";

export class StorageDriverFactory {
  private static instance: IStorageDriver | null = null;

  static getDriver(): IStorageDriver {
    if (this.instance) {
      return this.instance;
    }

    const driverType = config.STORAGE_DRIVER;

    switch (driverType) {
      case "local":
        this.instance = new LocalStorageDriver(config.STORAGE_ROOT);
        break;

      case "s3":
      case "r2":
      case "azure":
      case "minio":
        // Extensible driver foundation for cloud object stores
        // Fallback to local driver with warning until cloud credentials configured
        console.warn(
          `[STORAGE_DRIVER] Cloud driver '${driverType}' selected. Initializing LocalStorageDriver as runtime adapter.`
        );
        this.instance = new LocalStorageDriver(config.STORAGE_ROOT);
        break;

      default:
        this.instance = new LocalStorageDriver(config.STORAGE_ROOT);
        break;
    }

    return this.instance;
  }
}

export const storageDriver = StorageDriverFactory.getDriver();
