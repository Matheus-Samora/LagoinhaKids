# Update src/school.js
with open('src/school.js', 'r', encoding='utf-8') as f:
    school_code = f.read()

school_code = school_code.replace(
    "if(action==='child-lessons'){S.selectedChild=id;S.page='lessons';render();return true;}",
    "if(action==='child-lessons'){S.selectedChild=id;if(navigateTo)navigateTo('lessons');else{S.page='lessons';render();}return true;}"
)

school_code = school_code.replace(
    "if(action==='lesson-roster'){S.selectedLesson=id;S.page='attendance';render();return true;}",
    "if(action==='lesson-roster'){S.selectedLesson=id;if(navigateTo)navigateTo('attendance');else{S.page='attendance';render();}return true;}"
)

school_code = school_code.replace(
    "if(action==='room-students'||action==='filter-room'){S.room=String(id);S.selectedLesson=null;S.page='children';render();return true;}",
    "if(action==='room-students'||action==='filter-room'){S.room=String(id);S.selectedLesson=null;if(navigateTo)navigateTo('children');else{S.page='children';render();}return true;}"
)

with open('src/school.js', 'w', encoding='utf-8') as f:
    f.write(school_code)

print("Updated school.js successfully.")

# Update src/style.css
with open('src/style.css', 'r', encoding='utf-8') as f:
    style_code = f.read()

back_btn_css = """
.breadcrumbs {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 11px;
  color: #71717a;
}

.crumb-trail {
  display: flex;
  align-items: center;
  white-space: nowrap;
}

.back-nav-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 38px;
  padding: 6px 14px;
  border-radius: 9999px;
  background: #18181b;
  border: 1px solid #27272a;
  color: #ffffff;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s, border-color 0.15s, transform 0.1s;
}

.back-nav-btn:hover {
  background: #27272a;
  border-color: #3f3f46;
}

.back-nav-btn:active {
  transform: scale(0.96);
}
"""

if ".back-nav-btn" not in style_code:
    style_code += back_btn_css
    with open('src/style.css', 'w', encoding='utf-8') as f:
        f.write(style_code)
    print("Updated style.css successfully.")

# Update src/mobile.css
with open('src/mobile.css', 'r', encoding='utf-8') as f:
    mobile_code = f.read()

mobile_back_css = """
@media (max-width: 840px) {
  .breadcrumbs {
    display: flex;
    align-items: center;
    gap: 8px;
    overflow: hidden;
  }

  .back-nav-btn {
    min-height: 44px;
    min-width: 44px;
    padding: 8px 14px;
    font-size: 13px;
    flex-shrink: 0;
  }

  .crumb-trail {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
  }
}
"""

if ".back-nav-btn" not in mobile_code:
    mobile_code += mobile_back_css
    with open('src/mobile.css', 'w', encoding='utf-8') as f:
        f.write(mobile_code)
    print("Updated mobile.css successfully.")
