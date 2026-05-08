const UserResponseDto = (user) => {
  // Timestamps options
  const options = {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  };

  return {
    id: user.id,
    fullName: user.full_name,
    phoneNumber: user.phone_number,
    email: user.email,
    systemRole: user.system_role,
    designation: user.designation?.name || "N/A",
    isActive: user.is_active,
    signatureUrl: user.signature_url || null,
    // Return Department Name if available, otherwise just ID
    department: user.department?.name || user.department_id,
    createdAt: user.createdAt
      ? new Date(user.createdAt).toLocaleString("en-IN", options)
      : null,
  };
};

export default UserResponseDto;
