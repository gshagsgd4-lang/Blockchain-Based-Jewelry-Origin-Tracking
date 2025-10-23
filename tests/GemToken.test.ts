import { describe, it, expect, beforeEach } from "vitest";
import { ClarityValue, stringAsciiCV, uintCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_ASSET_ID = 101;
const ERR_INVALID_METADATA = 102;
const ERR_INVALID_QUANTITY = 103;
const ERR_INVALID_OWNER = 104;
const ERR_ASSET_ALREADY_EXISTS = 105;
const ERR_ASSET_NOT_FOUND = 106;
const ERR_INVALID_TIMESTAMP = 107;
const ERR_AUTHORITY_NOT_VERIFIED = 108;
const ERR_INVALID_MIN_QUANTITY = 109;
const ERR_INVALID_MAX_QUANTITY = 110;
const ERR_UPDATE_NOT_ALLOWED = 111;
const ERR_INVALID_UPDATE_PARAM = 112;
const ERR_MAX_ASSETS_EXCEEDED = 113;
const ERR_INVALID_ASSET_TYPE = 114;
const ERR_INVALID_ORIGIN = 115;
const ERR_INVALID_CERTIFICATION = 116;
const ERR_INVALID_LOCATION = 117;
const ERR_INVALID_UNIT = 118;
const ERR_INVALID_STATUS = 119;
const ERR_TRANSFER_NOT_ALLOWED = 120;

interface Metadata {
  origin: string;
  certification: string;
  location: string;
  unit: string;
}

interface Asset {
  assetType: string;
  metadata: Metadata;
  quantity: number;
  owner: string;
  timestamp: number;
  minter: string;
  status: boolean;
  minQuantity: number;
  maxQuantity: number;
}

interface AssetUpdate {
  updateMetadata: { origin: string; certification: string };
  updateQuantity: number;
  updateTimestamp: number;
  updater: string;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class GemTokenMock {
  state: {
    nextAssetId: number;
    maxAssets: number;
    mintFee: number;
    authorityContract: string | null;
    assets: Map<number, Asset>;
    assetUpdates: Map<number, AssetUpdate>;
    assetsByType: Map<string, number[]>;
    nftOwners: Map<number, string>;
    ftBalances: Map<string, number>;
  } = {
    nextAssetId: 0,
    maxAssets: 10000,
    mintFee: 500,
    authorityContract: null,
    assets: new Map(),
    assetUpdates: new Map(),
    assetsByType: new Map(),
    nftOwners: new Map(),
    ftBalances: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1TEST";
  authorities: Set<string> = new Set(["ST1TEST"]);
  stxTransfers: Array<{ amount: number; from: string; to: string | null }> = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      nextAssetId: 0,
      maxAssets: 10000,
      mintFee: 500,
      authorityContract: null,
      assets: new Map(),
      assetUpdates: new Map(),
      assetsByType: new Map(),
      nftOwners: new Map(),
      ftBalances: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1TEST";
    this.authorities = new Set(["ST1TEST"]);
    this.stxTransfers = [];
  }

  setAuthorityContract(contractPrincipal: string): Result<boolean> {
    if (contractPrincipal === "SP000000000000000000002Q6VF78") {
      return { ok: false, value: ERR_INVALID_OWNER };
    }
    if (this.state.authorityContract !== null) {
      return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };
    }
    this.state.authorityContract = contractPrincipal;
    return { ok: true, value: true };
  }

  setMintFee(newFee: number): Result<boolean> {
    if (!this.state.authorityContract) return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };
    this.state.mintFee = newFee;
    return { ok: true, value: true };
  }

  mintAsset(
    assetType: string,
    metadata: Metadata,
    quantity: number,
    owner: string,
    minQuantity: number,
    maxQuantity: number
  ): Result<number> {
    if (this.state.nextAssetId >= this.state.maxAssets) return { ok: false, value: ERR_MAX_ASSETS_EXCEEDED };
    if (!["diamond", "gold"].includes(assetType)) return { ok: false, value: ERR_INVALID_ASSET_TYPE };
    if (metadata.origin.length === 0 || metadata.origin.length > 256) return { ok: false, value: ERR_INVALID_METADATA };
    if (metadata.certification.length === 0 || metadata.certification.length > 256) return { ok: false, value: ERR_INVALID_METADATA };
    if (metadata.location.length === 0 || metadata.location.length > 100) return { ok: false, value: ERR_INVALID_METADATA };
    if (metadata.unit.length === 0 || metadata.unit.length > 20) return { ok: false, value: ERR_INVALID_METADATA };
    if (quantity <= 0) return { ok: false, value: ERR_INVALID_QUANTITY };
    if (owner === "SP000000000000000000002Q6VF78") return { ok: false, value: ERR_INVALID_OWNER };
    if (minQuantity <= 0) return { ok: false, value: ERR_INVALID_MIN_QUANTITY };
    if (maxQuantity <= 0) return { ok: false, value: ERR_INVALID_MAX_QUANTITY };
    if (!this.state.authorityContract) return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };

    this.stxTransfers.push({ amount: this.state.mintFee, from: this.caller, to: this.state.authorityContract });

    const id = this.state.nextAssetId;
    const asset: Asset = {
      assetType,
      metadata,
      quantity,
      owner,
      timestamp: this.blockHeight,
      minter: this.caller,
      status: true,
      minQuantity,
      maxQuantity,
    };
    this.state.assets.set(id, asset);
    const ids = this.state.assetsByType.get(assetType) || [];
    ids.push(id);
    this.state.assetsByType.set(assetType, ids);
    if (assetType === "diamond") {
      this.state.nftOwners.set(id, owner);
    } else {
      const balance = this.state.ftBalances.get(owner) || 0;
      this.state.ftBalances.set(owner, balance + quantity);
    }
    this.state.nextAssetId++;
    return { ok: true, value: id };
  }

  getAsset(id: number): Asset | null {
    return this.state.assets.get(id) || null;
  }

  updateAsset(id: number, updateMetadata: { origin: string; certification: string }, updateQuantity: number): Result<boolean> {
    const asset = this.state.assets.get(id);
    if (!asset) return { ok: false, value: ERR_ASSET_NOT_FOUND };
    if (asset.minter !== this.caller) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (updateMetadata.origin.length === 0 || updateMetadata.origin.length > 256) return { ok: false, value: ERR_INVALID_ORIGIN };
    if (updateMetadata.certification.length === 0 || updateMetadata.certification.length > 256) return { ok: false, value: ERR_INVALID_CERTIFICATION };
    if (updateQuantity <= 0) return { ok: false, value: ERR_INVALID_QUANTITY };

    const updated: Asset = {
      ...asset,
      metadata: { ...asset.metadata, ...updateMetadata },
      quantity: updateQuantity,
      timestamp: this.blockHeight,
    };
    this.state.assets.set(id, updated);
    this.state.assetUpdates.set(id, {
      updateMetadata,
      updateQuantity,
      updateTimestamp: this.blockHeight,
      updater: this.caller,
    });
    return { ok: true, value: true };
  }

  transferAsset(id: number, recipient: string): Result<boolean> {
    const asset = this.state.assets.get(id);
    if (!asset) return { ok: false, value: ERR_ASSET_NOT_FOUND };
    if (asset.owner !== this.caller) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (recipient === "SP000000000000000000002Q6VF78") return { ok: false, value: ERR_INVALID_OWNER };

    const updated: Asset = {
      ...asset,
      owner: recipient,
      timestamp: this.blockHeight,
    };
    this.state.assets.set(id, updated);
    if (asset.assetType === "diamond") {
      this.state.nftOwners.set(id, recipient);
    } else {
      const fromBalance = this.state.ftBalances.get(this.caller) || 0;
      const toBalance = this.state.ftBalances.get(recipient) || 0;
      this.state.ftBalances.set(this.caller, fromBalance - asset.quantity);
      this.state.ftBalances.set(recipient, toBalance + asset.quantity);
    }
    return { ok: true, value: true };
  }

  getAssetCount(): Result<number> {
    return { ok: true, value: this.state.nextAssetId };
  }

  checkAssetExistence(assetType: string): Result<boolean> {
    return { ok: true, value: this.state.assetsByType.has(assetType) };
  }
}

describe("GemToken", () => {
  let contract: GemTokenMock;

  beforeEach(() => {
    contract = new GemTokenMock();
    contract.reset();
  });

  it("mints a diamond asset successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const metadata: Metadata = { origin: "MineA", certification: "Cert1", location: "LocX", unit: "Carat" };
    const result = contract.mintAsset("diamond", metadata, 1, "ST3OWNER", 1, 10);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);

    const asset = contract.getAsset(0);
    expect(asset?.assetType).toBe("diamond");
    expect(asset?.metadata.origin).toBe("MineA");
    expect(asset?.quantity).toBe(1);
    expect(asset?.owner).toBe("ST3OWNER");
    expect(asset?.minQuantity).toBe(1);
    expect(asset?.maxQuantity).toBe(10);
    expect(contract.state.nftOwners.get(0)).toBe("ST3OWNER");
    expect(contract.stxTransfers).toEqual([{ amount: 500, from: "ST1TEST", to: "ST2TEST" }]);
  });

  it("mints a gold asset successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const metadata: Metadata = { origin: "MineB", certification: "Cert2", location: "LocY", unit: "Gram" };
    const result = contract.mintAsset("gold", metadata, 100, "ST4OWNER", 50, 500);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);

    const asset = contract.getAsset(0);
    expect(asset?.assetType).toBe("gold");
    expect(asset?.metadata.origin).toBe("MineB");
    expect(asset?.quantity).toBe(100);
    expect(asset?.owner).toBe("ST4OWNER");
    expect(asset?.minQuantity).toBe(50);
    expect(asset?.maxQuantity).toBe(500);
    expect(contract.state.ftBalances.get("ST4OWNER")).toBe(100);
    expect(contract.stxTransfers).toEqual([{ amount: 500, from: "ST1TEST", to: "ST2TEST" }]);
  });

  it("rejects mint without authority contract", () => {
    const metadata: Metadata = { origin: "MineA", certification: "Cert1", location: "LocX", unit: "Carat" };
    const result = contract.mintAsset("diamond", metadata, 1, "ST3OWNER", 1, 10);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_AUTHORITY_NOT_VERIFIED);
  });

  it("rejects invalid asset type", () => {
    contract.setAuthorityContract("ST2TEST");
    const metadata: Metadata = { origin: "MineA", certification: "Cert1", location: "LocX", unit: "Carat" };
    const result = contract.mintAsset("invalid", metadata, 1, "ST3OWNER", 1, 10);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_ASSET_TYPE);
  });

  it("rejects invalid metadata", () => {
    contract.setAuthorityContract("ST2TEST");
    const metadata: Metadata = { origin: "", certification: "Cert1", location: "LocX", unit: "Carat" };
    const result = contract.mintAsset("diamond", metadata, 1, "ST3OWNER", 1, 10);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_METADATA);
  });

  it("updates an asset successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const metadata: Metadata = { origin: "MineA", certification: "Cert1", location: "LocX", unit: "Carat" };
    contract.mintAsset("diamond", metadata, 1, "ST3OWNER", 1, 10);
    const updateMetadata = { origin: "MineB", certification: "Cert2" };
    const result = contract.updateAsset(0, updateMetadata, 2);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const asset = contract.getAsset(0);
    expect(asset?.metadata.origin).toBe("MineB");
    expect(asset?.metadata.certification).toBe("Cert2");
    expect(asset?.quantity).toBe(2);
    const update = contract.state.assetUpdates.get(0);
    expect(update?.updateMetadata.origin).toBe("MineB");
    expect(update?.updateMetadata.certification).toBe("Cert2");
    expect(update?.updateQuantity).toBe(2);
    expect(update?.updater).toBe("ST1TEST");
  });

  it("rejects update for non-existent asset", () => {
    contract.setAuthorityContract("ST2TEST");
    const updateMetadata = { origin: "MineB", certification: "Cert2" };
    const result = contract.updateAsset(99, updateMetadata, 2);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_ASSET_NOT_FOUND);
  });

  it("rejects update by non-minter", () => {
    contract.setAuthorityContract("ST2TEST");
    const metadata: Metadata = { origin: "MineA", certification: "Cert1", location: "LocX", unit: "Carat" };
    contract.mintAsset("diamond", metadata, 1, "ST3OWNER", 1, 10);
    contract.caller = "ST3FAKE";
    const updateMetadata = { origin: "MineB", certification: "Cert2" };
    const result = contract.updateAsset(0, updateMetadata, 2);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("transfers a diamond asset successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const metadata: Metadata = { origin: "MineA", certification: "Cert1", location: "LocX", unit: "Carat" };
    contract.mintAsset("diamond", metadata, 1, "ST1TEST", 1, 10);
    const result = contract.transferAsset(0, "ST4RECIPIENT");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const asset = contract.getAsset(0);
    expect(asset?.owner).toBe("ST4RECIPIENT");
    expect(contract.state.nftOwners.get(0)).toBe("ST4RECIPIENT");
  });

  it("transfers a gold asset successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const metadata: Metadata = { origin: "MineB", certification: "Cert2", location: "LocY", unit: "Gram" };
    contract.mintAsset("gold", metadata, 100, "ST1TEST", 50, 500);
    const result = contract.transferAsset(0, "ST5RECIPIENT");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const asset = contract.getAsset(0);
    expect(asset?.owner).toBe("ST5RECIPIENT");
    expect(contract.state.ftBalances.get("ST1TEST")).toBe(0);
    expect(contract.state.ftBalances.get("ST5RECIPIENT")).toBe(100);
  });

  it("rejects transfer for non-existent asset", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.transferAsset(99, "ST4RECIPIENT");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_ASSET_NOT_FOUND);
  });

  it("rejects transfer by non-owner", () => {
    contract.setAuthorityContract("ST2TEST");
    const metadata: Metadata = { origin: "MineA", certification: "Cert1", location: "LocX", unit: "Carat" };
    contract.mintAsset("diamond", metadata, 1, "ST3OWNER", 1, 10);
    const result = contract.transferAsset(0, "ST4RECIPIENT");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("sets mint fee successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.setMintFee(1000);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.mintFee).toBe(1000);
    const metadata: Metadata = { origin: "MineA", certification: "Cert1", location: "LocX", unit: "Carat" };
    contract.mintAsset("diamond", metadata, 1, "ST3OWNER", 1, 10);
    expect(contract.stxTransfers).toEqual([{ amount: 1000, from: "ST1TEST", to: "ST2TEST" }]);
  });

  it("rejects mint fee change without authority contract", () => {
    const result = contract.setMintFee(1000);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_AUTHORITY_NOT_VERIFIED);
  });

  it("returns correct asset count", () => {
    contract.setAuthorityContract("ST2TEST");
    const metadata1: Metadata = { origin: "MineA", certification: "Cert1", location: "LocX", unit: "Carat" };
    contract.mintAsset("diamond", metadata1, 1, "ST3OWNER", 1, 10);
    const metadata2: Metadata = { origin: "MineB", certification: "Cert2", location: "LocY", unit: "Gram" };
    contract.mintAsset("gold", metadata2, 100, "ST4OWNER", 50, 500);
    const result = contract.getAssetCount();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(2);
  });

  it("checks asset existence correctly", () => {
    contract.setAuthorityContract("ST2TEST");
    const metadata: Metadata = { origin: "MineA", certification: "Cert1", location: "LocX", unit: "Carat" };
    contract.mintAsset("diamond", metadata, 1, "ST3OWNER", 1, 10);
    const result = contract.checkAssetExistence("diamond");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const result2 = contract.checkAssetExistence("invalid");
    expect(result2.ok).toBe(true);
    expect(result2.value).toBe(false);
  });

  it("parses asset type with Clarity types", () => {
    const assetType: ClarityValue = stringAsciiCV("diamond");
    expect(assetType.value).toBe("diamond");
    const quantity: ClarityValue = uintCV(100);
    expect(quantity.value).toEqual(BigInt(100));
  });

  it("rejects mint with max assets exceeded", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.state.maxAssets = 1;
    const metadata1: Metadata = { origin: "MineA", certification: "Cert1", location: "LocX", unit: "Carat" };
    contract.mintAsset("diamond", metadata1, 1, "ST3OWNER", 1, 10);
    const metadata2: Metadata = { origin: "MineB", certification: "Cert2", location: "LocY", unit: "Gram" };
    const result = contract.mintAsset("gold", metadata2, 100, "ST4OWNER", 50, 500);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_ASSETS_EXCEEDED);
  });

  it("sets authority contract successfully", () => {
    const result = contract.setAuthorityContract("ST2TEST");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.authorityContract).toBe("ST2TEST");
  });

  it("rejects invalid authority contract", () => {
    const result = contract.setAuthorityContract("SP000000000000000000002Q6VF78");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_OWNER);
  });
});