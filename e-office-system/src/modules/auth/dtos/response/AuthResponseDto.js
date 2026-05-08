const AuthResponseDto = (user, token) => {
  return {
    token,
    user: {
      id: user.id,
      fullName: user.full_name,
      phoneNumber: user.phone_number,
      systemRole: user.system_role, // ADMIN, STAFF, BOARD_MEMBER
      // Used optional chaining here for an extra clean up!
      designation: user.designation?.name || null,
      department: user.department?.name || null,
      isPinSet: !!user.security_pin,
    },
  };
};

export default AuthResponseDto;
