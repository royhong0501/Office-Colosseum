/* ============================================================
   畫面 03 補充：5 張技能卡 + 示範格
   ============================================================ */

function SkillsGallery() {
  const [active, setActive] = React.useState("freeze");
  const skill = SKILLS.find(s => s.id === active);

  return (
    <>
      <div className="skills-cards">
        {SKILLS.map(s => (
          <div key={s.id}
               className={"skill-card" + (s.id === active ? " active" : "")}
               onClick={() => setActive(s.id)}>
            <div className="sk-icon">{s.emoji}</div>
            <div className="sk-name">{s.name}</div>
            <div className="sk-fn">{s.fn}</div>
            <div className="sk-cost">{s.cost}</div>
          </div>
        ))}
      </div>
      <div className="skill-demo">
        <div className="sd-title">示範 · {skill.name}</div>
        <div className="sd-desc">{skill.short}</div>
        <SkillDemoGrid skillId={skill.id} />
        <div style={{marginTop:10, fontSize:10.5, color:"var(--ink-muted)", fontFamily:"var(--font-mono)"}}>
          {"// 公式列：" + skill.fn}
        </div>
      </div>
    </>
  );
}

Object.assign(window, { SkillsGallery });
