/**
 * visionOS 风格空间背景。
 *
 * 深中性灰底 + 柔和景深光晕，保留极淡的中性透视网格提供空间纵深，
 * 整体去饱和、以通透与光影层次为主，贴近 Apple Vision Pro 的空间材质观感。
 * 纯 CSS 实现；`prefers-reduced-motion` 下自动停用动画。
 */

const GRID_IMAGE =
  'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px),' +
  'linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)';

export function AmbientBackground() {
  return (
    <div className="fixed inset-0 -z-0 overflow-hidden bg-[#0a0a0d]">
      {/* 深空中性基础辉光 */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_38%,_rgba(120,130,150,0.18),_transparent_60%)]" />

      {/* 柔和漂移的中性光晕，营造景深层次 */}
      <div className="ambient-orb absolute left-[10%] top-[6%] h-[46vw] w-[46vw] rounded-full bg-white/[0.06] blur-[150px] [animation:ambient-drift-a_32s_ease-in-out_infinite]" />
      <div className="ambient-orb absolute right-[4%] top-[34%] h-[42vw] w-[42vw] rounded-full bg-[#9fb4d6]/[0.07] blur-[160px] [animation:ambient-drift-b_38s_ease-in-out_infinite]" />

      {/* ===== 极淡中性透视网格（空间纵深） ===== */}
      <div
        className="absolute inset-x-0 top-0 bottom-1/2"
        style={{ perspective: '380px', perspectiveOrigin: 'center bottom' }}
      >
        <div
          className="ambient-grid absolute inset-0 origin-bottom [transform:rotateX(-78deg)] [animation:grid-flow_18s_linear_infinite]"
          style={{
            backgroundImage: GRID_IMAGE,
            backgroundSize: '68px 68px',
            maskImage: 'linear-gradient(to top, black, transparent 82%)',
            WebkitMaskImage: 'linear-gradient(to top, black, transparent 82%)',
          }}
        />
      </div>

      <div
        className="absolute inset-x-0 bottom-0 top-1/2"
        style={{ perspective: '380px', perspectiveOrigin: 'center top' }}
      >
        <div
          className="ambient-grid absolute inset-0 origin-top [transform:rotateX(78deg)] [animation:grid-flow_18s_linear_infinite]"
          style={{
            backgroundImage: GRID_IMAGE,
            backgroundSize: '68px 68px',
            maskImage: 'linear-gradient(to bottom, black, transparent 82%)',
            WebkitMaskImage:
              'linear-gradient(to bottom, black, transparent 82%)',
          }}
        />
      </div>

      {/* 地平线柔光（中性白，克制） */}
      <div className="ambient-horizon absolute inset-x-0 top-1/2 h-48 -translate-y-1/2 bg-[radial-gradient(ellipse_at_center,_rgba(255,255,255,0.12),_transparent_72%)] blur-3xl [animation:horizon-pulse_9s_ease-in-out_infinite]" />

      {/* 边缘暗角，聚焦中心内容 */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_48%,_rgba(0,0,0,0.65))]" />
    </div>
  );
}

export default AmbientBackground;
