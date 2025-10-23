(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-ASSET-ID u101)
(define-constant ERR-INVALID-METADATA u102)
(define-constant ERR-INVALID-QUANTITY u103)
(define-constant ERR-INVALID-OWNER u104)
(define-constant ERR-ASSET-ALREADY-EXISTS u105)
(define-constant ERR-ASSET-NOT-FOUND u106)
(define-constant ERR-INVALID-TIMESTAMP u107)
(define-constant ERR-AUTHORITY-NOT-VERIFIED u108)
(define-constant ERR-INVALID-MIN-QUANTITY u109)
(define-constant ERR-INVALID-MAX-QUANTITY u110)
(define-constant ERR-UPDATE-NOT-ALLOWED u111)
(define-constant ERR-INVALID-UPDATE-PARAM u112)
(define-constant ERR-MAX-ASSETS-EXCEEDED u113)
(define-constant ERR-INVALID-ASSET-TYPE u114)
(define-constant ERR-INVALID-ORIGIN u115)
(define-constant ERR-INVALID-CERTIFICATION u116)
(define-constant ERR-INVALID-LOCATION u117)
(define-constant ERR-INVALID-UNIT u118)
(define-constant ERR-INVALID-STATUS u119)
(define-constant ERR-TRANSFER-NOT-ALLOWED u120)

(define-data-var next-asset-id uint u0)
(define-data-var max-assets uint u10000)
(define-data-var mint-fee uint u500)
(define-data-var authority-contract (optional principal) none)

(define-non-fungible-token diamond-nft uint)
(define-fungible-token gold-ft uint)

(define-map assets
  uint
  {
    asset-type: (string-ascii 32),
    metadata: (tuple (origin (string-ascii 256)) (certification (string-ascii 256)) (location (string-ascii 100)) (unit (string-ascii 20))),
    quantity: uint,
    owner: principal,
    timestamp: uint,
    minter: principal,
    status: bool,
    min-quantity: uint,
    max-quantity: uint
  }
)

(define-map assets-by-type
  (string-ascii 32)
  (list 100 uint))

(define-map asset-updates
  uint
  {
    update-metadata: (tuple (origin (string-ascii 256)) (certification (string-ascii 256))),
    update-quantity: uint,
    update-timestamp: uint,
    updater: principal
  }
)

(define-readonly (get-asset (id uint))
  (map-get? assets id)
)

(define-readonly (get-asset-updates (id uint))
  (map-get? asset-updates id)
)

(define-readonly (is-asset-registered (asset-type (string-ascii 32)))
  (is-some (map-get? assets-by-type asset-type))
)

(define-private (validate-asset-type (asset-type (string-ascii 32)))
  (if (or (is-eq asset-type "diamond") (is-eq asset-type "gold"))
      (ok true)
      (err ERR-INVALID-ASSET-TYPE))
)

(define-private (validate-metadata (metadata (tuple (origin (string-ascii 256)) (certification (string-ascii 256)) (location (string-ascii 100)) (unit (string-ascii 20)))))
  (let ((origin (get origin metadata)) (cert (get certification metadata)) (loc (get location metadata)) (unit (get unit metadata)))
    (if (and (> (len origin) u0) (<= (len origin) u256) (> (len cert) u0) (<= (len cert) u256) (> (len loc) u0) (<= (len loc) u100) (> (len unit) u0) (<= (len unit) u20))
        (ok true)
        (err ERR-INVALID-METADATA)))
)

(define-private (validate-quantity (quantity uint))
  (if (> quantity u0)
      (ok true)
      (err ERR-INVALID-QUANTITY))
)

(define-private (validate-owner (owner principal))
  (if (not (is-eq owner 'SP000000000000000000002Q6VF78))
      (ok true)
      (err ERR-INVALID-OWNER))
)

(define-private (validate-timestamp (ts uint))
  (if (>= ts block-height)
      (ok true)
      (err ERR-INVALID-TIMESTAMP))
)

(define-private (validate-min-quantity (min uint))
  (if (> min u0)
      (ok true)
      (err ERR-INVALID-MIN-QUANTITY))
)

(define-private (validate-max-quantity (max uint))
  (if (> max u0)
      (ok true)
      (err ERR-INVALID-MAX-QUANTITY))
)

(define-private (validate-origin (origin (string-ascii 256)))
  (if (and (> (len origin) u0) (<= (len origin) u256))
      (ok true)
      (err ERR-INVALID-ORIGIN))
)

(define-private (validate-certification (cert (string-ascii 256)))
  (if (and (> (len cert) u0) (<= (len cert) u256))
      (ok true)
      (err ERR-INVALID-CERTIFICATION))
)

(define-private (validate-location (loc (string-ascii 100)))
  (if (and (> (len loc) u0) (<= (len loc) u100))
      (ok true)
      (err ERR-INVALID-LOCATION))
)

(define-private (validate-unit (unit (string-ascii 20)))
  (if (and (> (len unit) u0) (<= (len unit) u20))
      (ok true)
      (err ERR-INVALID-UNIT))
)

(define-public (set-authority-contract (contract-principal principal))
  (begin
    (try! (validate-owner contract-principal))
    (asserts! (is-none (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set authority-contract (some contract-principal))
    (ok true)
  )
)

(define-public (set-max-assets (new-max uint))
  (begin
    (asserts! (> new-max u0) (err ERR-MAX-ASSETS-EXCEEDED))
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set max-assets new-max)
    (ok true)
  )
)

(define-public (set-mint-fee (new-fee uint))
  (begin
    (asserts! (>= new-fee u0) (err ERR-INVALID-UPDATE-PARAM))
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set mint-fee new-fee)
    (ok true)
  )
)

(define-public (mint-asset
  (asset-type (string-ascii 32))
  (metadata (tuple (origin (string-ascii 256)) (certification (string-ascii 256)) (location (string-ascii 100)) (unit (string-ascii 20))))
  (quantity uint)
  (owner principal)
  (min-quantity uint)
  (max-quantity uint)
)
  (let (
        (next-id (var-get next-asset-id))
        (current-max (var-get max-assets))
        (authority (var-get authority-contract))
      )
    (asserts! (< next-id current-max) (err ERR-MAX-ASSETS-EXCEEDED))
    (try! (validate-asset-type asset-type))
    (try! (validate-metadata metadata))
    (try! (validate-quantity quantity))
    (try! (validate-owner owner))
    (try! (validate-min-quantity min-quantity))
    (try! (validate-max-quantity max-quantity))
    (let ((authority-recipient (unwrap! authority (err ERR-AUTHORITY-NOT-VERIFIED))))
      (try! (stx-transfer? (var-get mint-fee) tx-sender authority-recipient))
    )
    (if (is-eq asset-type "diamond")
        (try! (nft-mint? diamond-nft next-id owner))
        (try! (ft-mint? gold-ft quantity owner))
    )
    (map-set assets next-id
      {
        asset-type: asset-type,
        metadata: metadata,
        quantity: quantity,
        owner: owner,
        timestamp: block-height,
        minter: tx-sender,
        status: true,
        min-quantity: min-quantity,
        max-quantity: max-quantity
      }
    )
    (match (map-get? assets-by-type asset-type)
      ids (map-set assets-by-type asset-type (append ids next-id))
      (map-set assets-by-type asset-type (list next-id))
    )
    (var-set next-asset-id (+ next-id u1))
    (print { event: "asset-minted", id: next-id })
    (ok next-id)
  )
)

(define-public (update-asset
  (asset-id uint)
  (update-metadata (tuple (origin (string-ascii 256)) (certification (string-ascii 256))))
  (update-quantity uint)
)
  (let ((asset (map-get? assets asset-id)))
    (match asset
      a
        (begin
          (asserts! (is-eq (get minter a) tx-sender) (err ERR-NOT-AUTHORIZED))
          (try! (validate-origin (get origin update-metadata)))
          (try! (validate-certification (get certification update-metadata)))
          (try! (validate-quantity update-quantity))
          (map-set assets asset-id
            (merge a {
              metadata: (merge (get metadata a) update-metadata),
              quantity: update-quantity,
              timestamp: block-height
            })
          )
          (map-set asset-updates asset-id
            {
              update-metadata: update-metadata,
              update-quantity: update-quantity,
              update-timestamp: block-height,
              updater: tx-sender
            }
          )
          (print { event: "asset-updated", id: asset-id })
          (ok true)
        )
      (err ERR-ASSET-NOT-FOUND)
    )
  )
)

(define-public (transfer-asset (asset-id uint) (recipient principal))
  (let ((asset (unwrap! (map-get? assets asset-id) (err ERR-ASSET-NOT-FOUND))))
    (asserts! (is-eq (get owner asset) tx-sender) (err ERR-NOT-AUTHORIZED))
    (try! (validate-owner recipient))
    (if (is-eq (get asset-type asset) "diamond")
        (try! (nft-transfer? diamond-nft asset-id tx-sender recipient))
        (try! (ft-transfer? gold-ft (get quantity asset) tx-sender recipient))
    )
    (map-set assets asset-id
      (merge asset {
        owner: recipient,
        timestamp: block-height
      })
    )
    (print { event: "asset-transferred", id: asset-id, to: recipient })
    (ok true)
  )
)

(define-public (get-asset-count)
  (ok (var-get next-asset-id))
)

(define-public (check-asset-existence (asset-type (string-ascii 32)))
  (ok (is-some (map-get? assets-by-type asset-type)))
)