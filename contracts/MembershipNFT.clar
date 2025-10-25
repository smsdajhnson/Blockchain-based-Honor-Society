 
(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-METADATA u101)
(define-constant ERR-ALREADY-MINTED u102)
(define-constant ERR-NFT-NOT-FOUND u103)
(define-constant ERR-TRANSFER-DISALLOWED u104)
(define-constant ERR-INVALID-VOTING-CONTRACT u105)
(define-constant ERR-INVALID-TOKEN-ID u106)
(define-constant ERR-INVALID-RECIPIENT u107)
(define-constant ERR-INVALID-AUTHORITY u108)
(define-constant ERR-MINT-LIMIT-REACHED u109)

(define-data-var next-token-id uint u1)
(define-data-var mint-limit uint u1000)
(define-data-var voting-contract (optional principal) none)
(define-data-var authority-contract (optional principal) none)

(define-non-fungible-token membership-nft uint)

(define-map nft-metadata
  uint
  { 
    owner: principal,
    achievements-hash: (string-utf8 64),
    induction-date: uint,
    reputation-score: uint,
    status: bool
  }
)

(define-map token-ids-by-owner
  principal
  (list 10 uint)
)

(define-read-only (get-last-token-id)
  (ok (- (var-get next-token-id) u1))
)

(define-read-only (get-token-uri (token-id uint))
  (ok (some (concat "ipfs://" (get achievements-hash (map-get? nft-metadata token-id)))))
)

(define-read-only (get-owner (token-id uint))
  (ok (nft-get-owner? membership-nft token-id))
)

(define-read-only (get-nft-metadata (token-id uint))
  (map-get? nft-metadata token-id)
)

(define-read-only (get-tokens-by-owner (owner principal))
  (default-to (list) (map-get? token-ids-by-owner owner))
)

(define-read-only (is-member (principal principal))
  (ok (> (len (get-tokens-by-owner principal)) u0))
)

(define-private (validate-metadata (metadata { achievements-hash: (string-utf8 64), induction-date: uint }))
  (if (and (> (len (get achievements-hash metadata)) u0) (>= (get induction-date metadata) block-height))
      (ok true)
      (err ERR-INVALID-METADATA))
)

(define-private (validate-principal (p principal))
  (if (not (is-eq p 'SP000000000000000000002Q6VF78))
      (ok true)
      (err ERR-INVALID-RECIPIENT))
)

(define-private (validate-token-id (token-id uint))
  (if (< token-id (var-get next-token-id))
      (ok true)
      (err ERR-INVALID-TOKEN-ID))
)

(define-public (set-voting-contract (contract-principal principal))
  (begin
    (asserts! (is-none (var-get voting-contract)) (err ERR-INVALID-VOTING-CONTRACT))
    (try! (validate-principal contract-principal))
    (var-set voting-contract (some contract-principal))
    (ok true)
  )
)

(define-public (set-authority-contract (contract-principal principal))
  (begin
    (asserts! (is-none (var-get authority-contract)) (err ERR-INVALID-AUTHORITY))
    (try! (validate-principal contract-principal))
    (var-set authority-contract (some contract-principal))
    (ok true)
  )
)

(define-public (set-mint-limit (new-limit uint))
  (begin
    (asserts! (> new-limit u0) (err ERR-MINT-LIMIT-REACHED))
    (asserts! (is-some (var-get authority-contract)) (err ERR-INVALID-AUTHORITY))
    (var-set mint-limit new-limit)
    (ok true)
  )
)

(define-public (mint-membership-nft (recipient principal) (metadata { achievements-hash: (string-utf8 64), induction-date: uint }))
  (let ((token-id (var-get next-token-id))
        (voting (unwrap! (var-get voting-contract) (err ERR-INVALID-VOTING-CONTRACT))))
    (asserts! (< token-id (var-get mint-limit)) (err ERR-MINT-LIMIT-REACHED))
    (asserts! (is-eq tx-sender voting) (err ERR-NOT-AUTHORIZED))
    (try! (validate-principal recipient))
    (try! (validate-metadata metadata))
    (asserts! (is-none (nft-get-owner? membership-nft token-id)) (err ERR-ALREADY-MINTED))
    (try! (nft-mint? membership-nft token-id recipient))
    (map-set nft-metadata token-id 
      { 
        owner: recipient,
        achievements-hash: (get achievements-hash metadata),
        induction-date: (get induction-date metadata),
        reputation-score: u0,
        status: true
      }
    )
    (map-set token-ids-by-owner recipient
      (unwrap! (as-max-len? (cons token-id (get-tokens-by-owner recipient)) u10) (err ERR-INVALID-TOKEN-ID)))
    (var-set next-token-id (+ token-id u1))
    (print { event: "nft-minted", token-id: token-id, recipient: recipient })
    (ok token-id)
  )
)

(define-public (update-reputation (token-id uint) (new-score uint))
  (let ((metadata (map-get? nft-metadata token-id)))
    (match metadata
      data
        (begin
          (asserts! (is-some (var-get authority-contract)) (err ERR-INVALID-AUTHORITY))
          (asserts! (is-eq tx-sender (unwrap! (var-get authority-contract) (err ERR-INVALID-AUTHORITY))) (err ERR-NOT-AUTHORIZED))
          (try! (validate-token-id token-id))
          (map-set nft-metadata token-id
            { 
              owner: (get owner data),
              achievements-hash: (get achievements-hash data),
              induction-date: (get induction-date data),
              reputation-score: new-score,
              status: (get status data)
            }
          )
          (print { event: "reputation-updated", token-id: token-id, new-score: new-score })
          (ok true)
        )
      (err ERR-NFT-NOT-FOUND)
    )
  )
)

(define-public (set-nft-status (token-id uint) (status bool))
  (let ((metadata (map-get? nft-metadata token-id)))
    (match metadata
      data
        (begin
          (asserts! (is-some (var-get authority-contract)) (err ERR-INVALID-AUTHORITY))
          (asserts! (is-eq tx-sender (unwrap! (var-get authority-contract) (err ERR-INVALID-AUTHORITY))) (err ERR-NOT-AUTHORIZED))
          (try! (validate-token-id token-id))
          (map-set nft-metadata token-id
            { 
              owner: (get owner data),
              achievements-hash: (get achievements-hash data),
              induction-date: (get induction-date data),
              reputation-score: (get reputation-score data),
              status: status
            }
          )
          (print { event: "status-updated", token-id: token-id, status: status })
          (ok true)
        )
      (err ERR-NFT-NOT-FOUND)
    )
  )
)

(define-public (transfer (token-id uint) (sender principal) (recipient principal))
  (begin
    (asserts! false (err ERR-TRANSFER-DISALLOWED))
    (ok false)
  )
)