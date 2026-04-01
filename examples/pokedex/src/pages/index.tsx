import { css } from '@linaria/core'
import React, { useState, useRef, useCallback, useMemo } from 'react'
import { createRoot } from 'react-dom/client'
import { createCollection, useLiveQuery } from '@tanstack/react-db'
import { queryCollectionOptions } from '@tanstack/query-db-collection'
import { QueryClient } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import axios from 'axios'
import axiosMPAdapter from 'axios-miniprogram-adapter'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface PokemonListItem {
  [key: string]: unknown
  id: number
  name: string
  url: string
}

interface PokemonDetail {
  id: number
  name: string
  sprites: {
    other: {
      'official-artwork': { front_default: string }
    }
  }
  types: { slot: number; type: { name: string } }[]
}

// ---------------------------------------------------------------------------
// Query Client
// ---------------------------------------------------------------------------
const queryClient = new QueryClient()

// Setup axios adapter for miniprogram builds
if (import.meta.env.MODE === 'mp') {
  axios.defaults.adapter = axiosMPAdapter
}

// ---------------------------------------------------------------------------
// Collection — loads first 300 Pokémon from the PokeAPI
// ---------------------------------------------------------------------------
const pokemonCollection = createCollection(
  queryCollectionOptions({
    id: 'pokemon-list',
    queryClient,
    queryKey: ['pokemon-list'],
    queryFn: async () => {
      const res = await axios.get('https://pokeapi.co/api/v2/pokemon?limit=300')
      console.log(res)
      const json = res.data
      return json.results.map((p: { name: string; url: string }, i: number) => ({
        id: i + 1,
        name: p.name,
        url: p.url,
      })) as PokemonListItem[]
    },
    getKey: (item) => item.id,
  })
)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const padId = (id: number) => `#${String(id).padStart(3, '0')}`

const spriteUrl = (id: number) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// Type → color mapping for badges
const typeColors: Record<string, string> = {
  normal: '#A8A77A',
  fire: '#EE8130',
  water: '#6390F0',
  electric: '#F7D02C',
  grass: '#7AC74C',
  ice: '#96D9D6',
  fighting: '#C22E28',
  poison: '#A33EA1',
  ground: '#E2BF65',
  flying: '#A98FF3',
  psychic: '#F95587',
  bug: '#A6B91A',
  rock: '#B6A136',
  ghost: '#735797',
  dragon: '#6F35FC',
  dark: '#705746',
  steel: '#B7B7CE',
  fairy: '#D685AD',
}

// ---------------------------------------------------------------------------
// Styles (Linaria CSS-in-JS)
// ---------------------------------------------------------------------------
const resetStyle = css`
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    background: #f0f0f0;
    -webkit-font-smoothing: antialiased;
  }
`

const appShell = css`
  max-width: 420px;
  margin: 0 auto;
  min-height: 100dvh;
  background: #fff;
  display: flex;
  flex-direction: column;
`

const headerStyle = css`
  background: #e53935;
  color: #fff;
  padding: 16px 20px 12px;
  position: sticky;
  top: 0;
  z-index: 10;
`

const titleRow = css`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
`

const logoIcon = css`
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  color: #e53935;
  flex-shrink: 0;
`

const titleText = css`
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -0.5px;
`

const searchRow = css`
  display: flex;
  align-items: center;
  gap: 8px;
`

const searchBox = css`
  flex: 1;
  display: flex;
  align-items: center;
  background: #fff;
  border-radius: 24px;
  padding: 0 14px;
  height: 40px;
`

const searchIcon = css`
  color: #999;
  margin-right: 8px;
  font-size: 16px;
  flex-shrink: 0;
`

const searchInput = css`
  border: none;
  outline: none;
  background: transparent;
  flex: 1;
  font-size: 14px;
  color: #333;
  &::placeholder { color: #bbb; }
`

const sortBtn = css`
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(255,255,255,0.25);
  border: none;
  color: #fff;
  font-size: 18px;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  &:active { background: rgba(255,255,255,0.4); }
`

const scrollArea = css`
  flex: 1;
  overflow-y: auto;
  padding: 12px;
`

const gridRow = css`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  padding-bottom: 4px;
`

const cardStyle = css`
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.08);
  padding: 10px 8px 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s;
  &:active {
    transform: scale(0.97);
    box-shadow: 0 2px 8px rgba(0,0,0,0.12);
  }
`

const cardId = css`
  align-self: flex-end;
  font-size: 10px;
  color: #999;
  font-weight: 600;
  margin-bottom: 2px;
`

const cardImg = css`
  width: 72px;
  height: 72px;
  object-fit: contain;
  image-rendering: auto;
`

const cardName = css`
  font-size: 12px;
  font-weight: 600;
  color: #333;
  margin-top: 6px;
  text-align: center;
`

const emptyState = css`
  text-align: center;
  padding: 60px 20px;
  color: #999;
  font-size: 14px;
`

const loadingState = css`
  text-align: center;
  padding: 60px 20px;
  color: #999;
  font-size: 14px;
`

// Modal overlay
const overlayStyle = css`
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 24px;
`

const modalCard = css`
  background: #fff;
  border-radius: 20px;
  width: 100%;
  max-width: 340px;
  overflow: hidden;
  box-shadow: 0 12px 40px rgba(0,0,0,0.25);
  animation: modalIn 0.2s ease;
  @keyframes modalIn {
    from { opacity: 0; transform: scale(0.92); }
    to { opacity: 1; transform: scale(1); }
  }
`

const modalHeader = css`
  background: #e53935;
  padding: 20px 20px 60px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  position: relative;
`

const modalTitle = css`
  font-size: 22px;
  font-weight: 800;
  color: #fff;
`

const modalId = css`
  font-size: 14px;
  color: rgba(255,255,255,0.8);
  font-weight: 600;
`

const closeBtn = css`
  background: none;
  border: none;
  color: #fff;
  font-size: 22px;
  cursor: pointer;
  padding: 4px;
  line-height: 1;
`

const modalImgWrap = css`
  display: flex;
  justify-content: center;
  margin-top: -50px;
  position: relative;
  z-index: 1;
`

const modalImg = css`
  width: 140px;
  height: 140px;
  object-fit: contain;
  filter: drop-shadow(0 4px 12px rgba(0,0,0,0.15));
`

const typeBadges = css`
  display: flex;
  gap: 8px;
  justify-content: center;
  padding: 12px 20px 20px;
`

const badge = css`
  padding: 4px 16px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 700;
  color: #fff;
  text-transform: capitalize;
`

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function PokemonCard({ pokemon, onClick }: { pokemon: PokemonListItem; onClick: () => void }) {
  return (
    <div className={cardStyle} onClick={onClick}>
      <span className={cardId}>{padId(pokemon.id)}</span>
      <img
        className={cardImg}
        src={spriteUrl(pokemon.id)}
        alt={pokemon.name}
        loading="lazy"
      />
      <span className={cardName}>{capitalize(pokemon.name)}</span>
    </div>
  )
}

function DetailModal({ id, onClose }: { id: number; onClose: () => void }) {
  const [detail, setDetail] = useState<PokemonDetail | null>(null)

  React.useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    axios
      .get(`https://pokeapi.co/api/v2/pokemon/${id}`, { signal: controller.signal })
      .then((r) => {
        if (!cancelled) setDetail(r.data)
      })
      .catch(() => {
        /* ignore */
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [id])

  return (
    <div className={overlayStyle} onClick={onClose}>
      <div className={modalCard} onClick={(e) => e.stopPropagation()}>
        <div className={modalHeader}>
          <div>
            <div className={modalTitle}>
              {detail ? capitalize(detail.name) : '…'}
            </div>
            <div className={modalId}>{padId(id)}</div>
          </div>
          <button className={closeBtn} onClick={onClose}>✕</button>
        </div>
        <div className={modalImgWrap}>
          <img
            className={modalImg}
            src={spriteUrl(id)}
            alt=""
          />
        </div>
        {detail && (
          <div className={typeBadges}>
            {detail.types.map((t) => (
              <span
                key={t.type.name}
                className={badge}
                style={{ background: typeColors[t.type.name] ?? '#888' }}
              >
                {t.type.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Pokedex() {
  const [search, setSearch] = useState('')
  const [sortById, setSortById] = useState(true)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Live query from TanStack DB collection
  const { data: allPokemon } = useLiveQuery((q) =>
    q.from({ p: pokemonCollection })
  )

  // Filter + sort
  const filtered = useMemo(() => {
    let list = (allPokemon ?? []) as PokemonListItem[]
    if (search.trim()) {
      const term = search.toLowerCase().trim()
      list = list.filter(
        (p) =>
          p.name.includes(term) ||
          String(p.id).includes(term) ||
          padId(p.id).includes(term)
      )
    }
    return [...list].sort((a, b) =>
      sortById ? a.id - b.id : a.name.localeCompare(b.name)
    )
  }, [allPokemon, search, sortById])

  // We display 3 columns → each virtual row = 3 cards
  const rowCount = Math.ceil(filtered.length / 3)

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 146, // approximate row height
    overscan: 4,
  })

  return (
    <div className={appShell}>
      {/* Header */}
      <header className={headerStyle}>
        <div className={titleRow}>
          <div className={logoIcon}>◓</div>
          <span className={titleText}>Pokédex</span>
        </div>
        <div className={searchRow}>
          <div className={searchBox}>
            <span className={searchIcon}>🔍</span>
            <input
              className={searchInput}
              placeholder="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button
            className={sortBtn}
            title={sortById ? 'Sort by name' : 'Sort by number'}
            onClick={() => setSortById((v) => !v)}
          >
            #
          </button>
        </div>
      </header>

      {/* Virtualised scroll area */}
      <div ref={scrollRef} className={scrollArea}>
        {filtered.length === 0 && allPokemon && allPokemon.length > 0 && (
          <div className={emptyState}>No Pokémon found for "{search}"</div>
        )}
        {(!allPokemon || allPokemon.length === 0) && (
          <div className={loadingState}>Loading Pokémon…</div>
        )}
        {filtered.length > 0 && (
          <div
            style={{
              height: virtualizer.getTotalSize(),
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualizer.getVirtualItems().map((vRow) => {
              const startIdx = vRow.index * 3
              const rowItems = filtered.slice(startIdx, startIdx + 3)
              return (
                <div
                  key={vRow.key}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: vRow.size,
                    transform: `translateY(${vRow.start}px)`,
                  }}
                >
                  <div className={gridRow}>
                    {rowItems.map((p) => (
                      <PokemonCard
                        key={p.id}
                        pokemon={p}
                        onClick={() => setSelectedId(p.id)}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Detail modal */}
      {selectedId !== null && (
        <DetailModal id={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------
export default function createApp() {
  const el = document.createElement('div')
  el.className = resetStyle
  document.body.appendChild(el)
  const root = createRoot(el)
  root.render(<Pokedex />)
}

if (import.meta.env.MODE === 'web') createApp()
// @ts-ignore
if (import.meta.env.MODE === 'mp') window.createApp = createApp
