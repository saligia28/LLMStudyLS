import React from 'react'
import { Menu, Tag } from 'antd'
import { FileTextOutlined, FolderOutlined } from '@ant-design/icons'

function Sidebar({ structure, selectedItem, onSelect, collapsed }) {
  if (!structure?.weeks) return null

  const menuItems = structure.weeks.map(week => ({
    key: week.id,
    icon: <FolderOutlined />,
    label: collapsed ? week.id.replace('week', 'W') : week.title,
    children: week.steps.map(step => ({
      key: `${week.id}:${step.id}`,
      icon: <FileTextOutlined />,
      label: collapsed ? (
        step.title
      ) : (
        <div className="tw-flex tw-items-center tw-justify-between">
          <span className="tw-truncate">{step.title}</span>
          {step.tags?.length > 0 && (
            <Tag color="blue" className="tw-ml-2 tw-text-xs">
              {step.tags[0]}
            </Tag>
          )}
        </div>
      ),
    })),
  }))

  const selectedKey = selectedItem ? `${selectedItem.weekId}:${selectedItem.stepId}` : null

  const handleClick = ({ key }) => {
    const [weekId, stepId] = key.split(':')
    if (weekId && stepId) {
      onSelect(weekId, stepId)
    }
  }

  return (
    <Menu
      mode="inline"
      selectedKeys={selectedKey ? [selectedKey] : []}
      defaultOpenKeys={structure.weeks.map(w => w.id)}
      items={menuItems}
      onClick={handleClick}
      className="tw-border-none"
    />
  )
}

export default Sidebar
