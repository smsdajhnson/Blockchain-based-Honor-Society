 
import { describe, it, expect, beforeEach } from 'vitest';
import { Cl, stringUtf8CV, uintCV, principalCV, tupleCV, ClarityValue } from '@stacks/transactions';

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_METADATA = 101;
const ERR_ALREADY_MINTED = 102;
const ERR_NFT_NOT_FOUND = 103;
const ERR_TRANSFER_DISALLOWED = 104;
const ERR_INVALID_VOTING_CONTRACT = 105;
const ERR_INVALID_TOKEN_ID = 106;
const ERR_INVALID_RECIPIENT = 107;
const ERR_INVALID_AUTHORITY = 108;
const ERR_MINT_LIMIT_REACHED = 109;

interface NFTMetadata {
  owner: string;
  achievementsHash: string;
  inductionDate: number;
  reputationScore: number;
  status: boolean;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class MembershipNFTMock {
  state: {
    nextTokenId: number;
    mintLimit: number;
    votingContract: string | null;
    authorityContract: string | null;
    nfts: Map<number, NFTMetadata>;
    tokenIdsByOwner: Map<string, number[]>;
  } = {
    nextTokenId: 1,
    mintLimit: 1000,
    votingContract: null,
    authorityContract: null,
    nfts: new Map(),
    tokenIdsByOwner: new Map(),
  };
  blockHeight: number = 0;
  caller: string = 'ST1TEST';
  stxTransfers: Array<{ amount: number; from: string; to: string | null }> = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      nextTokenId: 1,
      mintLimit: 1000,
      votingContract: null,
      authorityContract: null,
      nfts: new Map(),
      tokenIdsByOwner: new Map(),
    };
    this.blockHeight = 0;
    this.caller = 'ST1TEST';
    this.stxTransfers = [];
  }

  setVotingContract(contractPrincipal: string): Result<boolean> {
    if (contractPrincipal === 'SP000000000000000000002Q6VF78') return { ok: false, value: false };
    if (this.state.votingContract !== null) return { ok: false, value: false };
    this.state.votingContract = contractPrincipal;
    return { ok: true, value: true };
  }

  setAuthorityContract(contractPrincipal: string): Result<boolean> {
    if (contractPrincipal === 'SP000000000000000000002Q6VF78') return { ok: false, value: false };
    if (this.state.authorityContract !== null) return { ok: false, value: false };
    this.state.authorityContract = contractPrincipal;
    return { ok: true, value: true };
  }

  mintMembershipNFT(recipient: string, metadata: { achievementsHash: string; inductionDate: number }): Result<number> {
    if (this.state.nextTokenId >= this.state.mintLimit) return { ok: false, value: ERR_MINT_LIMIT_REACHED };
    if (!this.state.votingContract) return { ok: false, value: ERR_INVALID_VOTING_CONTRACT };
    if (this.caller !== this.state.votingContract) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (recipient === 'SP000000000000000000002Q6VF78') return { ok: false, value: ERR_INVALID_RECIPIENT };
    if (!metadata.achievementsHash || metadata.inductionDate < this.blockHeight) return { ok: false, value: ERR_INVALID_METADATA };
    const tokenId = this.state.nextTokenId;
    if (this.state.nfts.has(tokenId)) return { ok: false, value: ERR_ALREADY_MINTED };

    const nft: NFTMetadata = {
      owner: recipient,
      achievementsHash: metadata.achievementsHash,
      inductionDate: metadata.inductionDate,
      reputationScore: 0,
      status: true,
    };
    this.state.nfts.set(tokenId, nft);
    const currentTokens = this.state.tokenIdsByOwner.get(recipient) || [];
    this.state.tokenIdsByOwner.set(recipient, [...currentTokens, tokenId].slice(0, 10));
    this.state.nextTokenId++;
    return { ok: true, value: tokenId };
  }

  getLastTokenId(): Result<number> {
    return { ok: true, value: this.state.nextTokenId - 1 };
  }

  getTokenUri(tokenId: number): Result<string | null> {
    const nft = this.state.nfts.get(tokenId);
    return nft ? { ok: true, value: `ipfs://${nft.achievementsHash}` } : { ok: true, value: null };
  }

  getOwner(tokenId: number): Result<string | null> {
    const nft = this.state.nfts.get(tokenId);
    return { ok: true, value: nft ? nft.owner : null };
  }

  getNFTMetadata(tokenId: number): NFTMetadata | null {
    return this.state.nfts.get(tokenId) || null;
  }

  getTokensByOwner(owner: string): number[] {
    return this.state.tokenIdsByOwner.get(owner) || [];
  }

  isMember(principal: string): Result<boolean> {
    return { ok: true, value: this.getTokensByOwner(principal).length > 0 };
  }

  updateReputation(tokenId: number, newScore: number): Result<boolean> {
    if (!this.state.authorityContract) return { ok: false, value: ERR_INVALID_AUTHORITY };
    if (this.caller !== this.state.authorityContract) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (tokenId >= this.state.nextTokenId) return { ok: false, value: ERR_INVALID_TOKEN_ID };
    const nft = this.state.nfts.get(tokenId);
    if (!nft) return { ok: false, value: ERR_NFT_NOT_FOUND };
    this.state.nfts.set(tokenId, { ...nft, reputationScore: newScore });
    return { ok: true, value: true };
  }

  setNFTStatus(tokenId: number, status: boolean): Result<boolean> {
    if (!this.state.authorityContract) return { ok: false, value: ERR_INVALID_AUTHORITY };
    if (this.caller !== this.state.authorityContract) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (tokenId >= this.state.nextTokenId) return { ok: false, value: ERR_INVALID_TOKEN_ID };
    const nft = this.state.nfts.get(tokenId);
    if (!nft) return { ok: false, value: ERR_NFT_NOT_FOUND };
    this.state.nfts.set(tokenId, { ...nft, status });
    return { ok: true, value: true };
  }

  transfer(_tokenId: number, _sender: string, _recipient: string): Result<boolean> {
    return { ok: false, value: ERR_TRANSFER_DISALLOWED };
  }
}

describe('MembershipNFT', () => {
  let contract: MembershipNFTMock;

  beforeEach(() => {
    contract = new MembershipNFTMock();
    contract.reset();
  });

  it('mints NFT successfully', () => {
    contract.setVotingContract('ST2VOTING');
    contract.caller = 'ST2VOTING';
    const result = contract.mintMembershipNFT('ST3MEMBER', { achievementsHash: 'abc123', inductionDate: 100 });
    expect(result.ok).toBe(true);
    expect(result.value).toBe(1);
    const metadata = contract.getNFTMetadata(1);
    expect(metadata).toEqual({
      owner: 'ST3MEMBER',
      achievementsHash: 'abc123',
      inductionDate: 100,
      reputationScore: 0,
      status: true,
    });
    expect(contract.getTokensByOwner('ST3MEMBER')).toEqual([1]);
    expect(contract.getLastTokenId()).toEqual({ ok: true, value: 1 });
    expect(contract.getTokenUri(1)).toEqual({ ok: true, value: 'ipfs://abc123' });
    expect(contract.getOwner(1)).toEqual({ ok: true, value: 'ST3MEMBER' });
    expect(contract.isMember('ST3MEMBER')).toEqual({ ok: true, value: true });
  });

  it('rejects minting without voting contract', () => {
    const result = contract.mintMembershipNFT('ST3MEMBER', { achievementsHash: 'abc123', inductionDate: 100 });
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_VOTING_CONTRACT);
  });

  it('rejects minting by unauthorized caller', () => {
    contract.setVotingContract('ST2VOTING');
    contract.caller = 'ST4FAKE';
    const result = contract.mintMembershipNFT('ST3MEMBER', { achievementsHash: 'abc123', inductionDate: 100 });
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it('rejects minting with invalid metadata', () => {
    contract.setVotingContract('ST2VOTING');
    contract.caller = 'ST2VOTING';
    const result = contract.mintMembershipNFT('ST3MEMBER', { achievementsHash: '', inductionDate: 0 });
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_METADATA);
  });

  it('rejects minting to invalid recipient', () => {
    contract.setVotingContract('ST2VOTING');
    contract.caller = 'ST2VOTING';
    const result = contract.mintMembershipNFT('SP000000000000000000002Q6VF78', { achievementsHash: 'abc123', inductionDate: 100 });
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_RECIPIENT);
  });

  it('rejects minting when limit reached', () => {
    contract.setVotingContract('ST2VOTING');
    contract.caller = 'ST2VOTING';
    contract.state.mintLimit = 1;
    contract.state.nextTokenId = 1;
    const result = contract.mintMembershipNFT('ST3MEMBER', { achievementsHash: 'abc123', inductionDate: 100 });
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MINT_LIMIT_REACHED);
  });

  it('updates reputation successfully', () => {
    contract.setVotingContract('ST2VOTING');
    contract.setAuthorityContract('ST4AUTH');
    contract.caller = 'ST2VOTING';
    contract.mintMembershipNFT('ST3MEMBER', { achievementsHash: 'abc123', inductionDate: 100 });
    contract.caller = 'ST4AUTH';
    const result = contract.updateReputation(1, 50);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const metadata = contract.getNFTMetadata(1);
    expect(metadata?.reputationScore).toBe(50);
  });

  it('rejects reputation update by non-authority', () => {
    contract.setVotingContract('ST2VOTING');
    contract.setAuthorityContract('ST4AUTH');
    contract.caller = 'ST2VOTING';
    contract.mintMembershipNFT('ST3MEMBER', { achievementsHash: 'abc123', inductionDate: 100 });
    contract.caller = 'ST5FAKE';
    const result = contract.updateReputation(1, 50);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it('sets NFT status successfully', () => {
    contract.setVotingContract('ST2VOTING');
    contract.setAuthorityContract('ST4AUTH');
    contract.caller = 'ST2VOTING';
    contract.mintMembershipNFT('ST3MEMBER', { achievementsHash: 'abc123', inductionDate: 100 });
    contract.caller = 'ST4AUTH';
    const result = contract.setNFTStatus(1, false);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const metadata = contract.getNFTMetadata(1);
    expect(metadata?.status).toBe(false);
  });

  it('rejects transfer', () => {
    contract.setVotingContract('ST2VOTING');
    contract.caller = 'ST2VOTING';
    contract.mintMembershipNFT('ST3MEMBER', { achievementsHash: 'abc123', inductionDate: 100 });
    const result = contract.transfer(1, 'ST3MEMBER', 'ST4OTHER');
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_TRANSFER_DISALLOWED);
  });

  it('sets voting contract successfully', () => {
    const result = contract.setVotingContract('ST2VOTING');
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.votingContract).toBe('ST2VOTING');
  });

  it('rejects invalid voting contract', () => {
    const result = contract.setVotingContract('SP000000000000000000002Q6VF78');
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });
});