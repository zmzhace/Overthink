import Store from "electron-store";

import type { StorageArea } from "@/shared/ipc";

type StorageValues = Record<string, unknown>;

export class OverthinkStorage {
  private readonly local = new Store<StorageValues>({ name: "local-storage" });
  private readonly session = new Map<string, unknown>();

  get(area: StorageArea, keys?: string | string[]): StorageValues {
    const source = this.readArea(area);

    if (keys == null) {
      return source;
    }

    const keyList = Array.isArray(keys) ? keys : [keys];
    return keyList.reduce<StorageValues>((result, key) => {
      result[key] = source[key];
      return result;
    }, {});
  }

  set(area: StorageArea, values: StorageValues): void {
    if (area === "local") {
      Object.entries(values).forEach(([key, value]) => {
        this.local.set(key, value);
      });
      return;
    }

    Object.entries(values).forEach(([key, value]) => {
      this.session.set(key, value);
    });
  }

  remove(area: StorageArea, keys: string | string[]): void {
    const keyList = Array.isArray(keys) ? keys : [keys];

    if (area === "local") {
      keyList.forEach((key) => this.local.delete(key));
      return;
    }

    keyList.forEach((key) => this.session.delete(key));
  }

  clear(area: StorageArea): void {
    if (area === "local") {
      this.local.clear();
      return;
    }

    this.session.clear();
  }

  private readArea(area: StorageArea): StorageValues {
    if (area === "local") {
      return this.local.store;
    }

    return Object.fromEntries(this.session.entries());
  }
}
